import { AbstractInputSuggest, type TFile, type TFolder } from "obsidian";

export class FileSuggest extends AbstractInputSuggest<TFile> {
  getSuggestions(query: string): TFile[] {
    const lowerQuery = query.toLowerCase();
    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.path.toLowerCase().contains(lowerQuery));
  }

  renderSuggestion(file: TFile, el: HTMLElement): void {
    el.setText(file.path);
  }

  selectSuggestion(file: TFile): void {
    this.setValue(file.path);
    this.close();
  }
}

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
  getSuggestions(query: string): TFolder[] {
    const lowerQuery = query.toLowerCase();
    return this.app.vault
      .getAllFolders()
      .filter((folder) => folder.path.toLowerCase().contains(lowerQuery));
  }

  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.setText(folder.path);
  }

  selectSuggestion(folder: TFolder): void {
    this.setValue(folder.path);
    this.close();
  }
}
