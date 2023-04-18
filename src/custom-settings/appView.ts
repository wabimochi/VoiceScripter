import { Settings } from '../settings';
import { appElm } from './appElm';

export const appView = (settings: Settings) => {
    const appList: string[] = [];
    for(let i = 0; i < settings.apps.length; i++) {
        appList.push(appElm(i, settings.apps[i]));
    }
    return `
        <div id="apps-root" class="component-root">
            <div id="apps-list">
                ${appList.join('\n')}
            </div>
            <vscode-button id="add-app-button" appearance="primary">App追加</vscode-button>
        </div>
    `;
}