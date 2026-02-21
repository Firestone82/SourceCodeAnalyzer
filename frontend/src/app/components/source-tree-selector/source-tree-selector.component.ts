import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {NzFormatEmitEvent, NzTreeModule} from 'ng-zorro-antd/tree';
import {NzTreeNode, NzTreeNodeKey, NzTreeNodeOptions} from 'ng-zorro-antd/core/tree';
import {NzTagModule} from 'ng-zorro-antd/tag';
import {catchError, finalize, of} from 'rxjs';
import {SourcesApiService} from '../../service/api/types/sources-api.service';
import {SourceFolderChildEntryDto, SourceFolderChildrenResponseDto} from '../../service/api/api.models';

@Component({
  selector: 'app-source-tree-selector',
  standalone: true,
  imports: [NzTreeModule, NzTagModule],
  templateUrl: './source-tree-selector.component.html'
})
export class SourceTreeSelectorComponent implements OnInit {
  @Input() public mode: 'single' | 'multiple' = 'single';
  @Input() public selectedKeys: string[] = [];
  @Input() public showTags: boolean = false;
  @Input() public tagColorResolver: ((tag: string) => string) | null = null;

  @Output() public readonly selectedKeysChange = new EventEmitter<string[]>();
  @Output() public readonly sourceSelected = new EventEmitter<string>();
  @Output() public readonly leafSelectionChange = new EventEmitter<string[]>();
  @Output() public readonly loadingChange = new EventEmitter<boolean>();
  @Output() public readonly errorChange = new EventEmitter<string | null>();

  public sourceTreeNodes: NzTreeNodeOptions[] = [];

  private readonly folderPagination = new Map<string, FolderPaginationState>();
  private readonly loadingFolders = new Set<string>();
  private readonly loadedFolders = new Set<string>();
  private readonly pageSize: number = 50;
  private readonly tagColors: string[] = ['blue', 'green', 'red', 'orange', 'purple', 'cyan', 'magenta', 'lime'];
  private sourceTreeLeafMap: Map<string, string[]> = new Map();
  private pendingRemovedKeys: Set<string> = new Set();

  public constructor(private readonly sourcesApiService: SourcesApiService) {
  }

  public ngOnInit(): void {
    this.loadRoot();
  }

  public handleTreeClick(event: NzFormatEmitEvent): void {
    const treeEvent = event as NzFormatEmitEvent;
    const node = treeEvent.node;
    if (!node) {
      return;
    }

    const origin = node.origin as SourceTreeNodeOrigin;
    if (origin?.isLoadMore) {
      const parentPath = origin.parentPath ?? '';
      const nextOffset = this.folderPagination.get(parentPath)?.nextOffset ?? null;
      if (nextOffset !== null) {
        this.loadFolderChildren(parentPath, node.parentNode, nextOffset, true);
      }
      return;
    }

    const key = node.key?.toString();
    if (!key) {
      return;
    }

    if (origin?.hasChildren && !origin.hasSource) {
      const shouldExpand = !node.isExpanded;
      node.isExpanded = shouldExpand;
      if (shouldExpand) {
        this.loadChildrenForNode(node);
      }
      return;
    }

    if (this.mode === 'single' && origin?.hasSource) {
      this.selectedKeys = [key];
      this.selectedKeysChange.emit(this.selectedKeys);
      this.leafSelectionChange.emit([key]);
      this.sourceSelected.emit(key);
    }
  }

  public handleTreeExpand(event: NzFormatEmitEvent): void {
    const treeEvent = event as NzFormatEmitEvent;
    const node = treeEvent.node;
    if (!node || !node.isExpanded) {
      return;
    }

    const origin = node.origin as SourceTreeNodeOrigin;
    if (origin?.hasSource) {
      node.isExpanded = false;
      return;
    }
    this.loadChildrenForNode(node);
  }


  public resolveTagColor(tag: string): string {
    if (this.tagColorResolver) {
      return this.tagColorResolver(tag);
    }

    const hash = Array.from(tag).reduce((accumulator, character) => accumulator + character.charCodeAt(0), 0);
    return this.tagColors[hash % this.tagColors.length];
  }


  public handleTreeCheckboxChange(event: unknown): void {
    if (this.mode !== 'multiple') {
      return;
    }

    const treeEvent = event as NzFormatEmitEvent;
    const node = treeEvent.node;
    if (!node) {
      return;
    }

    const origin = node.origin as SourceTreeNodeOrigin;
    if (origin?.isLoadMore) {
      return;
    }

    const key = node.key?.toString();
    if (!key || node.isChecked) {
      this.pendingRemovedKeys.clear();
      return;
    }

    const keysToRemove = this.expandSourceKeys([key]);
    this.pendingRemovedKeys = new Set<string>([key, ...keysToRemove]);
  }

  public handleCheckedKeysChange(keys: NzTreeNodeKey[]): void {
    const normalizedKeys = keys.filter((key): key is string => typeof key === 'string');
    const preservedSelections = new Set<string>(this.selectedKeys);

    for (const removedKey of this.pendingRemovedKeys) {
      preservedSelections.delete(removedKey);
    }

    for (const key of normalizedKeys) {
      preservedSelections.add(key);
    }

    const nextSelectedKeys = Array.from(preservedSelections);
    this.pendingRemovedKeys.clear();
    this.selectedKeys = nextSelectedKeys;
    this.selectedKeysChange.emit(nextSelectedKeys);
    this.leafSelectionChange.emit(this.expandSourceKeys(nextSelectedKeys));
  }

  private loadRoot(): void {
    this.errorChange.emit(null);
    this.sourceTreeNodes = [];
    this.loadingChange.emit(true);
    this.loadedFolders.clear();
    this.folderPagination.clear();
    this.sourceTreeLeafMap = new Map();

    this.sourcesApiService
      .getSourceFolderChildren(null, {offset: 0, limit: this.pageSize})
      .pipe(
        catchError(() => {
          this.errorChange.emit('Failed to load sources.');
          return of<SourceFolderChildrenResponseDto>({children: [], total: 0, next_offset: null});
        }),
        finalize(() => {
          this.loadingChange.emit(false);
        })
      )
      .subscribe((response: SourceFolderChildrenResponseDto | null) => {
        if (!response) {
          return;
        }
        this.applyRootChildren(response, false);
      });
  }

  private loadChildrenForNode(node: NzTreeNode): void {
    if (node.isLeaf) {
      return;
    }
    const origin = node.origin as SourceTreeNodeOrigin;
    if (origin?.hasSource) {
      return;
    }
    const key = node.key?.toString() ?? '';
    if (!key || this.loadingFolders.has(key) || this.loadedFolders.has(key)) {
      return;
    }
    this.loadFolderChildren(key, node, 0, false);
  }

  private loadFolderChildren(folderPath: string, node: NzTreeNode | null, offset: number, append: boolean): void {
    if (this.loadingFolders.has(folderPath)) {
      return;
    }
    this.loadingFolders.add(folderPath);

    this.sourcesApiService
      .getSourceFolderChildren(folderPath || null, {offset, limit: this.pageSize})
      .pipe(
        catchError(() => {
          this.errorChange.emit('Failed to load sources.');
          return of<SourceFolderChildrenResponseDto>({children: [], total: 0, next_offset: null});
        }),
        finalize(() => {
          this.loadingFolders.delete(folderPath);
        })
      )
      .subscribe((response: SourceFolderChildrenResponseDto | null) => {
        if (!response) {
          return;
        }
        if (node) {
          this.applyNodeChildren(node, folderPath, response, append);
        } else {
          this.applyRootChildren(response, append);
        }
      });
  }

  private applyRootChildren(response: SourceFolderChildrenResponseDto, append: boolean): void {
    const nodes = this.buildTreeNodes(response.children ?? []);
    if (append) {
      this.sourceTreeNodes = this.stripLoadMore(this.sourceTreeNodes);
      this.sourceTreeNodes = [...this.sourceTreeNodes, ...nodes];
    } else {
      this.sourceTreeNodes = nodes;
      this.loadedFolders.add('');
    }
    this.updatePagination('', response);
    this.rebuildLeafMap();
  }

  private applyNodeChildren(node: NzTreeNode, folderPath: string, response: SourceFolderChildrenResponseDto, append: boolean): void {
    const nodes = this.buildTreeNodes(response.children ?? []);
    const existing = node.children ?? [];
    const cleaned = this.stripLoadMore(existing);
    node.clearChildren();
    if (append) {
      node.addChildren([...cleaned, ...nodes]);
    } else {
      node.addChildren(nodes);
      this.loadedFolders.add(folderPath);
    }
    this.updatePagination(folderPath, response, node);
    this.rebuildLeafMap();
  }

  private buildTreeNodes(entries: SourceFolderChildEntryDto[]): NzTreeNodeOptions[] {
    return entries.map((entry) => ({
      title: entry.name,
      key: entry.path,
      isLeaf: entry.has_source || !entry.has_children,
      hasSource: entry.has_source,
      hasChildren: entry.has_children && !entry.has_source,
      sourceTag: entry.source_tag ?? null
    }));
  }

  private updatePagination(folderPath: string, response: SourceFolderChildrenResponseDto, node?: NzTreeNode): void {
    const nextOffset = response.next_offset ?? null;
    this.folderPagination.set(folderPath, {nextOffset});
    if (nextOffset !== null) {
      const loadMoreNode: NzTreeNodeOptions = {
        title: 'Load more…',
        key: this.buildLoadMoreKey(folderPath, nextOffset),
        isLeaf: true,
        selectable: false,
        isLoadMore: true,
        parentPath: folderPath
      };
      if (node) {
        node.addChildren([loadMoreNode]);
      } else {
        this.sourceTreeNodes = [...this.sourceTreeNodes, loadMoreNode];
      }
    }
  }

  private rebuildLeafMap(): void {
    const map = new Map<string, string[]>();

    const walk = (nodes: NzTreeNodeOptions[]): string[] => {
      const leaves: string[] = [];
      for (const node of nodes) {
        const origin = node as SourceTreeNodeOrigin;
        if (origin.isLoadMore) {
          continue;
        }
        const key = node.key?.toString() ?? '';
        if (!key) {
          continue;
        }

        const children = (node.children as NzTreeNodeOptions[] | undefined) ?? [];
        let nodeLeaves: string[];
        if (origin.hasSource || children.length === 0) {
          nodeLeaves = [key];
        } else {
          nodeLeaves = walk(children);
        }

        map.set(key, nodeLeaves);
        leaves.push(...nodeLeaves);
      }
      return leaves;
    };

    walk(this.sourceTreeNodes);
    this.sourceTreeLeafMap = map;
  }

  private expandSourceKeys(keys: string[]): string[] {
    const expandedKeys = new Set<string>();
    for (const key of keys) {
      const leafKeys = this.sourceTreeLeafMap.get(key);
      if (!leafKeys) {
        continue;
      }
      for (const leafKey of leafKeys) {
        expandedKeys.add(leafKey);
      }
    }
    return Array.from(expandedKeys);
  }

  private stripLoadMore(nodes: NzTreeNodeOptions[] | NzTreeNode[]): NzTreeNodeOptions[] {
    return nodes
      .filter((child) => {
        if (child instanceof NzTreeNode) {
          return !(child.origin as SourceTreeNodeOrigin)?.isLoadMore;
        }
        return !(child as SourceTreeNodeOrigin)?.isLoadMore;
      })
      .map((child) => child instanceof NzTreeNode ? (child.origin as NzTreeNodeOptions) : child as NzTreeNodeOptions);
  }

  private buildLoadMoreKey(folderPath: string, offset: number): string {
    return `__load_more__:${folderPath}:${offset}`;
  }
}

type SourceTreeNodeOrigin = {
  hasSource?: boolean;
  hasChildren?: boolean;
  isLoadMore?: boolean;
  parentPath?: string;
  sourceTag?: string | null;
};

type FolderPaginationState = {
  nextOffset: number | null;
};
