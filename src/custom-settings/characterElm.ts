import { Settings, Character } from '../settings';
import { RenameReporter } from "../utilities/renameReporter";
import { attributeElm } from './attributeElm';

export function MakeCharacter(): Character {
    return {
        characterName: "",
        appName: "",
        color: "#FFFFFF",
        description: "",
        attributes: [],
    };
  }

export const characterElm = (index:number, settings: Settings, character: Character, renameReporter: RenameReporter) => {
    const appOptions: string[] = [];
    for(let i = 0; i < settings.apps.length; i++){
        appOptions.push(`<vscode-option>${settings.apps[i].appName}</vscode-option>`);
    }

    const attributeList: string[] = [];
    for(let i = 0; i < character.attributes.length; i++) {
        attributeList.push(attributeElm(i, character, character.attributes[i], renameReporter));
    }
    const originalName = renameReporter.getOldCharacterName(character.characterName);

    return `
        <div class="character container" data-index="${index}" data-original="${originalName}" style="border-color:${character.color}">
            <h1 class="title">${character.characterName}</h1>
            <h3 class="label">キャラクター名</h3>
            <vscode-text-field class="character-name" value="${character.characterName}"></vscode-text-field>
            <div class="reserve"></div>
            <h3 class="label">色</h3>
            <div class="flex-row">
                <input type="color" class="color-input margin-right" value="${character.color}" list="color-list">
                <vscode-text-field maxlength="7" class="color-code" value="${character.color}"></vscode-text-field>
            </div>
            <h3 class="label">アプリケーション名</h3>
            <vscode-dropdown position="below" class="character-app-selector" current-value="${character.appName}">
                ${appOptions.join('\n')}
            </vscode-dropdown>
            <h3 class="label">説明</h3>
            <div class="add-info-label">ChatGPTに渡されるキャラクターの説明です。必要に応じて入力してください。</div>
            <vscode-text-area resize="vertical" rows="3" class="character-description" value="${character.description}"></vscode-text-area>
            <details ${character.attributes.length > 0 ? "" : "open"}>
                <summary class="label">属性</summary>
                <div class="attribute-root">
                    ${attributeList.join('\n')}
                </div>
                <vscode-button appearance="primary" class="add-attr-button">Attribute追加</vscode-button>
            </details>
            <div class="close-button">
                <vscode-button appearance="icon" class="close-button-inner">
                    <span class="codicon codicon-close"></span>
                </vscode-button>
            </div>
        </div>
    `
}