import { ClassNames } from "../../constants/";
import { ItemError } from "./errors";

const EXPLORER_KEY = "explorer";

const DEFAULT_FILE = "/src/lib.rs";
const DEFAULT_CODE = `use anchor_lang::prelude::*;

// This is your program's public key and it will update
// automatically when you first build the project.
declare_id!("11111111111111111111111111111111");

#[program]
mod hello_anchor {
    use super::*;
    pub fn initialize(ctx: Context<Initialize>, data: u64) -> Result<()> {
        ctx.accounts.new_account.data = data;
        msg!("Changed data to: {}!", data); // Message will show up in the tx logs
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
  // We must specify the space in order to initialize an account.
  // First 8 bytes are default account discriminator,
  // next 8 bytes come from NewAccount.data being type u64.
  // (u64 = 64 bits unsigned integer = 8 bytes)
  #[account(init, payer = signer, space = 8 + 8)]
  pub new_account: Account<'info, NewAccount>,
  #[account(mut)]
  pub signer: Signer<'info>,
  pub system_program: Program<'info, System>,
}

#[account]
#[derive(Default)]
pub struct NewAccount {
    data: u64
}`;

const DEFAULT_EXPLORER = {
  files: {
    [DEFAULT_FILE]: {
      content: DEFAULT_CODE,
      tabs: true,
      current: true,
    },
  },
};

interface ExplorerJSON {
  files: {
    [key: string]: ItemInfo;
  };
}

interface ItemInfo {
  content?: string;
  current?: boolean;
  tabs?: boolean;
}

export interface FullFile extends ItemInfo {
  path: string;
}

interface Folder {
  folders: string[];
  files: string[];
}

// Non-static methods only
export class Explorer {
  private _explorer: ExplorerJSON;

  constructor() {
    let explorer;

    const lsExplorer = localStorage.getItem(EXPLORER_KEY);

    if (lsExplorer) explorer = JSON.parse(lsExplorer);
    else {
      explorer = DEFAULT_EXPLORER;
      localStorage.setItem(EXPLORER_KEY, JSON.stringify(explorer));
    }

    this._explorer = explorer;
  }

  saveLs() {
    localStorage.setItem(EXPLORER_KEY, JSON.stringify(this._explorer));
  }

  newItem(fullPath: string) {
    // Invalid name
    if (!PgExplorer.isItemNameValid(PgExplorer.getItemNameFromPath(fullPath)!))
      return { err: ItemError.InvalidName };

    const files = this._explorer.files;

    // Already exists
    if (files[fullPath]) return { err: ItemError.AlreadyExists };

    const itemType = PgExplorer.getItemTypeFromPath(fullPath);

    if (itemType.folder) {
      files[fullPath] = {};
    } else {
      // File
      files[fullPath] = {
        content: "",
        current: true,
        tabs: true,
      };

      this.changeCurrentFile(fullPath);
    }
  }

  deleteItem(fullPath: string) {
    const files = this._explorer.files;

    const isCurrentFile = files[fullPath]?.current;

    for (const path in files) {
      if (path.startsWith(fullPath)) {
        delete files[path];
      }
    }

    // If we delete all elements from a folder, the parent folder disappears too.
    // We are adding the folder back to mitigate that
    const parentPath = PgExplorer.getParentPathFromPath(fullPath);
    files[parentPath] = {};

    // If there is no folder, create src folder
    if (Object.keys(files).length === 1) files[parentPath + "src/"] = {};

    // Change current file to the last tab when current file is deleted
    if (isCurrentFile) this.changeCurrentFileToTheLastTab();
  }

  renameItem(fullPath: string, newName: string) {
    if (!PgExplorer.isItemNameValid(newName))
      return { err: ItemError.InvalidName };

    const files = this._explorer.files;

    const itemType = PgExplorer.getItemTypeFromPath(fullPath);

    if (itemType.file) {
      // Check to see if newName already exists
      const parentFolder = PgExplorer.getParentPathFromPath(fullPath);
      const newPath = parentFolder + newName;

      if (files[newPath]) return { err: ItemError.AlreadyExists };

      // Store the file
      const file = files[fullPath];

      // Delete the old path
      delete files[fullPath];

      // Set the new path
      files[newPath] = file;
    } else if (itemType.folder) {
      // We need to loop through all files in order to change every dependent path
      for (const path in files) {
        // /programs/my_program/logs/logfile.log
        // If we are renaming 'my_program' then we can split by '/'
        // Put newName instead of 'my_program' and recreate the string
        const oldName = PgExplorer.getItemNameFromPath(fullPath);
        const itemsArr = path.split("/");

        let newPath = "";
        for (const item of itemsArr) {
          if (item === oldName) {
            newPath = newPath + newName + "/";
          } else {
            newPath += item + "/";
          }
        }

        // Check if newPath exists
        if (files[newPath]) return { err: ItemError.AlreadyExists };

        // Store the data
        const data = files[path];

        // Delete the data
        delete files[path];

        // Set the new path with the data
        files[newPath] = data;
      }
    }
  }

  getFileContentFromPath(path: string) {
    const files = this._explorer.files;
    const fileInfo: ItemInfo = files[path];

    return fileInfo?.content;
  }

  getFileContentFromEl(el: HTMLDivElement) {
    const files = this._explorer.files;

    const path = PgExplorer.getItemPathFromEl(el)!;

    const fileInfo: ItemInfo = files[path];

    if (fileInfo.content) return fileInfo.content;
    return null;
  }

  getFolderContent(path: string) {
    const files = this._explorer.files;
    let filesAndFolders: Folder = { folders: [], files: [] };

    for (const itemPath in files) {
      if (itemPath.includes(path)) {
        const item = itemPath.split(path)[1].split("/")[0];
        if (
          !filesAndFolders.files.includes(item) &&
          !filesAndFolders.folders.includes(item) &&
          item
        ) {
          // It's a file if it contains '.'
          // TODO: Implement a better system for folders and files
          if (item.includes(".")) filesAndFolders.files.push(item);
          else filesAndFolders.folders.push(item);
        }
      }
    }

    return filesAndFolders;
  }

  saveFile(path: string, content: string) {
    const files = this._explorer.files;

    if (files[path]) files[path].content = content;
  }

  getCurrentFile() {
    const files = this._explorer.files;

    for (const path in files) {
      const fileInfo: ItemInfo = files[path];

      if (fileInfo.current) {
        const currentFile: FullFile = { content: fileInfo.content, path };
        return currentFile;
      }
    }

    return null;
  }

  changeCurrentFile(newPath: string) {
    const files = this._explorer.files;

    let curFile = this.getCurrentFile();

    if (curFile) files[curFile.path].current = false;

    files[newPath].current = true;

    // If the file is not in tabs add it
    const tabs = this.getTabs();

    for (const path in tabs) {
      if (path === newPath) return;
    }

    files[newPath].tabs = true;
  }

  getTabs() {
    const files = this._explorer.files;
    let tabs: FullFile[] = [];

    for (const path in files) {
      const fileInfo: ItemInfo = files[path];

      if (fileInfo.tabs)
        tabs.push({
          content: fileInfo.content,
          path,
          current: fileInfo.current,
        });
    }

    return tabs;
  }

  changeCurrentFileToTheLastTab() {
    const tabs = this.getTabs();
    if (tabs.length === 0) return;

    const lastTabPath = tabs[tabs.length - 1].path;
    this.changeCurrentFile(lastTabPath);
  }

  removeFromTabs(path: string) {
    const files = this._explorer.files;
    files[path].tabs = false;

    // Change current file to the last tab
    this.changeCurrentFileToTheLastTab();
  }

  getBuildFiles() {
    const files = this._explorer.files;
    let buildFiles = [];

    for (const path in files) {
      files[path].content && buildFiles.push([path, files[path].content]);
    }

    return buildFiles;
  }
}

// Static methods only
export class PgExplorer {
  static getItemNameFromPath(path: string) {
    const itemsArr = path.split("/");
    const itemType = this.getItemTypeFromPath(path);

    if (itemType.folder) {
      const folderName = itemsArr[itemsArr.length - 2];
      return folderName;
    } else if (itemType.file) {
      const fileName = itemsArr[itemsArr.length - 1];
      return fileName;
    }

    return null;
  }

  // TODO: Implement a better identifier
  static getItemTypeFromName(itemName: string) {
    if (itemName.includes(".")) return { file: true };
    return { folder: true };
  }

  static getItemTypeFromPath(path: string) {
    if (path.endsWith("/")) return { folder: true };
    return { file: true };
  }

  static getItemTypeFromEl = (el: HTMLDivElement) => {
    if (el.classList.contains(ClassNames.FOLDER)) {
      return { folder: true };
    } else if (el.classList.contains("file")) {
      return { file: true };
    }

    return null;
  };

  static getItemPathFromEl = (el: HTMLDivElement | null) => {
    if (!el) return null;

    return el.getAttribute("data-path");
  };

  static getParentPathFromPath(path: string) {
    const itemsArr = path.split("/");
    const itemType = this.getItemTypeFromPath(path);

    let parentPath = "/";

    if (itemType.folder) {
      for (let i = 0; i < itemsArr.length - 2; i++) {
        if (itemsArr[i] === "") continue;
        parentPath += itemsArr[i] + "/";
      }
    } else if (itemType.file) {
      for (let i = 0; i < itemsArr.length - 1; i++) {
        if (itemsArr[i] === "") continue;
        parentPath += itemsArr[i] + "/";
      }
    }

    return parentPath;
  }

  static getParentPathFromEl = (selected: HTMLDivElement | null) => {
    if (!selected) return null;

    const itemType = this.getItemTypeFromEl(selected);

    if (itemType?.folder) {
      return selected?.getAttribute("data-path");
    } else if (itemType?.file) {
      // The file's owner folder is parent element's previous sibling
      return selected.parentElement!.previousElementSibling!.getAttribute(
        "data-path"
      );
    }

    return null;
  };

  static getElFromPath(path: string) {
    return document.querySelector(`[data-path='${path}']`) as HTMLDivElement;
  }

  static getRootFolderEl() {
    return document.getElementById("root-dir");
  }

  static getSelectedEl = () => {
    return document.getElementsByClassName(
      ClassNames.SELECTED
    )[0] as HTMLDivElement;
  };

  static setSelectedEl = (newEl: HTMLDivElement) => {
    const selectedEl = this.getSelectedEl();
    selectedEl?.classList.remove(ClassNames.SELECTED);
    newEl.classList.add(ClassNames.SELECTED);
  };

  static openFolder = (el: HTMLDivElement) => {
    // Folder icon
    el.classList.add(ClassNames.OPEN);

    // Toggle inside folder
    const insideFolderEl = el.nextElementSibling;
    if (insideFolderEl) insideFolderEl.classList.remove(ClassNames.HIDDEN);
  };

  static toggleFolder = (el: HTMLDivElement) => {
    // Folder icon
    el.classList.toggle(ClassNames.OPEN);

    // Toggle inside folder
    const insideFolderEl = el.nextElementSibling;
    if (insideFolderEl) insideFolderEl.classList.toggle(ClassNames.HIDDEN);
  };

  static openAllParents(path: string) {
    let _path = path;
    for (;;) {
      const parentPath = this.getParentPathFromPath(_path);
      const parentEl = this.getElFromPath(parentPath);

      if (!parentEl) break;

      this.openFolder(parentEl);
      if (parentPath === "/") break;

      _path = parentPath;
    }
  }

  static collapseAllFolders() {
    let rootEl = this.getRootFolderEl();

    for (;;) {
      if (!rootEl || !rootEl.childElementCount) break;
      // Close folder
      rootEl.children[0]?.classList.remove(ClassNames.OPEN);
      rootEl.children[1]?.classList.add(ClassNames.HIDDEN);
      // Remove selected
      const selectedEl = this.getSelectedEl();
      if (selectedEl) selectedEl.classList.remove(ClassNames.SELECTED);

      rootEl = rootEl?.children[1] as HTMLElement;
    }
  }

  static isItemNameValid(name: string) {
    return (
      name.match(/^(?!\.)[\w.-]+$/) &&
      !name.includes("//") &&
      !name.includes("..")
    );
  }
}
