import { Settings } from '../settings';
import { RenameReporter } from "../utilities/renameReporter";
import {characterElm} from './characterElm';

export const characterView = (settings: Settings, renameReporter : RenameReporter) => {
    const charaterList: string[] = [];
    for(let i = 0; i < settings.characters.length; i++) {
        charaterList.push(characterElm(i, settings, settings.characters[i], renameReporter));
    }
    return `
        <div id="characters-root" class="component-root">
            <div id="characters-list">
                ${charaterList.join('\n')}
            </div>
            <vscode-button id="add-characters-button" appearance="primary">キャラクター追加</vscode-button>
        </div>
    `
};