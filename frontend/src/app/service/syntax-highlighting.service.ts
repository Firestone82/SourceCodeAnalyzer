import {Injectable} from '@angular/core';
import {type BundledLanguage, type BundledTheme, createHighlighter, type Highlighter} from 'shiki';
import MarkdownIt from 'markdown-it';

@Injectable({providedIn: 'root'})
export class SyntaxHighlighterService {

  private highlighterPromise: Promise<Highlighter> | null = null;
  private markdownParser: MarkdownIt | null = null;
  private defaultTheme: BundledTheme = 'github-light';

  public async getSourceHighlighter(): Promise<Highlighter> {
    if (this.highlighterPromise !== null) {
      return this.highlighterPromise;
    }

    this.highlighterPromise = createHighlighter({
      themes: ['github-dark', 'github-light'] satisfies BundledTheme[],
      langs: ['c', 'cpp', 'rust', 'java', 'python', 'asm'] satisfies BundledLanguage[]
    });

    return this.highlighterPromise;
  }

  public async codeToHtml(
    code: string,
    language: BundledLanguage,
    theme: BundledTheme = this.defaultTheme
  ): Promise<string> {
    const highlighterInstance: Highlighter = await this.getSourceHighlighter();

    return highlighterInstance.codeToHtml(code, {
      lang: language,
      theme,
    });
  }

  public async markdownToHtml(
    markdown: string,
    theme: BundledTheme = this.defaultTheme
  ): Promise<string> {
    const markdownParserInstance: MarkdownIt = await this.getMarkdownParser(theme);
    return markdownParserInstance.render(markdown);
  }

  private async getMarkdownParser(theme: BundledTheme): Promise<MarkdownIt> {
    if (this.markdownParser !== null) {
      return this.markdownParser;
    }

    const highlighterInstance: Highlighter = await this.getSourceHighlighter();

    const markdownParserInstance: MarkdownIt = new MarkdownIt({
      html: true,
      highlight: (codeString: string, languageString: string): string => {
        const language =
          highlighterInstance.getLoadedLanguages().includes(languageString as BundledLanguage)
            ? (languageString as BundledLanguage)
            : 'plaintext';

        return highlighterInstance.codeToHtml(codeString, {
          lang: language,
          theme
        });
      }
    });

    this.markdownParser = markdownParserInstance;
    return markdownParserInstance;
  }
}
