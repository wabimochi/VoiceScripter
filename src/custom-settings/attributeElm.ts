import { RenameReporter } from "../utilities/renameReporter";
import { Settings, Character, Attribute } from '../settings';

// Make Attribute
export function MakeAttribute(): Attribute {
    return {
        attr: "",
        color: "#FFFFFF",
        colorInherit: true,
    };
}

export const attributeElm = (index: number, character: Character, attribute: Attribute, renameReporter: RenameReporter) => {
    const attrColor = attribute.color ? attribute.color : "#FFFFFF";
    const color = attribute.colorInherit ? (character ? character.color : attrColor) : attrColor;
    const originalName = renameReporter.getOldAttributeName(attribute.attr, character.characterName);

    return `
        <div class="attribute container" data-index="${index}" data-original="${originalName}">
            <h3 class="label">属性名</h3>
            <vscode-text-field class="attribute-name" value="${attribute.attr}"></vscode-text-field>
            <div class="reserve"></div>
            <h3 class="label">色</h3>
            <vscode-checkbox class="inherit-color-check" ${attribute.colorInherit ? "checked" : ""}>キャラクターのカラーを使用</vscode-checkbox>
            <div class="flex-row">
                <input ${attribute.colorInherit ? "disabled" : ""} type="color" class="color-input margin-right" value="${color}" list="color-list">
                <vscode-text-field maxlength="7" ${attribute.colorInherit ? "disabled" : ""} class="color-code" value="${color}"></vscode-text-field>
            </div>
            <div class="close-button">
                <vscode-button appearance="icon" class="close-button-inner">
                    <span class="codicon codicon-close"></span>
                </vscode-button>
            </div>
            <vscode-divider role="separator"></vscode-divider>
        </div>
    `
}