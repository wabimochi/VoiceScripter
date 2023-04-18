import {
  provideVSCodeDesignSystem,
  Checkbox,
  DataGrid,
  vsCodeBadge,
  vsCodeButton,
  vsCodeCheckbox,
  vsCodeDataGrid,
  vsCodeDataGridCell,
  vsCodeDataGridRow,
  vsCodeDivider,
  vsCodeDropdown,
  vsCodeLink,
  vsCodeOption,
  vsCodePanels,
  vsCodePanelTab,
  vsCodePanelView,
  vsCodeProgressRing,
  vsCodeRadio,
  vsCodeRadioGroup,
  vsCodeTag,
  vsCodeTextArea,
  vsCodeTextField,
} from "@vscode/webview-ui-toolkit";
import { Settings, Character } from "../settings";
import { extensionView } from "../custom-settings/extensionView";
import { assistantView } from "../custom-settings/assistantView";
import { appView } from "../custom-settings/appView";
import { characterView } from "../custom-settings/characterView";
import { characterElm, MakeCharacter } from "../custom-settings/characterElm";
import { attributeElm, MakeAttribute } from "../custom-settings/attributeElm";
import { appElm, MakeApp } from "../custom-settings/appElm";
import { RenameReporter } from "../utilities/renameReporter";
import { VarCharacterName, VarAttribute, VarBody } from '../common';


// In order to use the Webview UI Toolkit web components they
// must be registered with the browser (i.e. webview) using the
// syntax below.
provideVSCodeDesignSystem().register(
  vsCodeBadge(),
  vsCodeButton(),
  vsCodeCheckbox(),
  vsCodeDataGrid(),
  vsCodeDataGridCell(),
  vsCodeDataGridRow(),
  vsCodeDivider(),
  vsCodeDropdown(),
  vsCodeLink(),
  vsCodeOption(),
  vsCodePanels(),
  vsCodePanelTab(),
  vsCodePanelView(),
  vsCodeProgressRing(),
  vsCodeRadio(),
  vsCodeRadioGroup(),
  vsCodeTag(),
  vsCodeTextArea(),
  vsCodeTextField()
);

type VSCode = {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
};

function initialize(vscode: VSCode) {
  window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
      case 'initialize':
        updateHtml(vscode, message.data.settings, message.data.enableAssistant, message.data.renameReporter);
        break;
      case 'update-api-key':
        updateApiKeyButtonState(message.data);
        break;
    }
  });
}

function updateHtml(vscode: VSCode, settings: Settings, enableAssistant: boolean, _renameReporter: RenameReporter) {
  const renameReporter = new RenameReporter();
  renameReporter.initializeFromRenameReporter(_renameReporter);

  initializeExtensionView(vscode, settings, renameReporter);
  initializeAssistantView(vscode, settings, renameReporter, enableAssistant);
  initializeAppView(settings);
  initializeCharacterView(settings, renameReporter);

  const charactersList = document.querySelector('#characters-list')! as HTMLElement;
  const appList = document.querySelector('#apps-list')!;

  document.addEventListener('keydown', function (event) {
    const target = event.target as HTMLInputElement;
    if(target.matches('.input-uint')){
      const min = Number(target.getAttribute('min'));
      const max = Number(target.getAttribute('max'));
      const e = event as KeyboardEvent;
      if(e.key === 'ArrowUp'){
        let value = Number(target.value) + 1;
        value = Math.min(value, max);
        target.value = value.toString();
      } else if(e.key === 'ArrowDown'){
        let value = Number(target.value) - 1;
        value = Math.max(value, min);
        target.value = value.toString();
      } else {
        return;
      }
    }
    if(target.matches('#meta-alpha')){
      settings.extension.metaAlpha = Number(target.value);
      updateSettings(vscode, settings, renameReporter);
    } else if(target.matches('#name-length')){
      settings.extension.nameLength = Number(target.value);
      updateSettings(vscode, settings, renameReporter);
    } else if(target.matches('#assistant-max-length')){
      settings.assistant.maxLine = Number(target.value);
      updateSettings(vscode, settings, renameReporter);
    }
  });

  document.addEventListener('input', function (event) {
    const target = event.target as HTMLInputElement;
    if(target.matches('.input-uint')){
      const min = Number(target.getAttribute('min'));
      const max = Number(target.getAttribute('max'));
      target.value = limitNumber(target.value.replace(/[^0-9]/g,''), min, max).toString();
    }

    if(target.matches('#meta-alpha')){
      settings.extension.metaAlpha = Number(target.value);
      updateSettings(vscode, settings, renameReporter);
    } else if(target.matches('#name-length')){
      settings.extension.nameLength = Number(target.value);
      updateSettings(vscode, settings, renameReporter);
    } else if(target.matches('#assistant-max-length')){
      settings.assistant.maxLine = Number(target.value);
      updateSettings(vscode, settings, renameReporter);
    }
  });

  const addCharacterButton = document.querySelector('#add-characters-button')!;
  addCharacterButton.addEventListener('click', () => {
    const item = document.createElement('div');
    const newCharacter = MakeCharacter();
    item.innerHTML = characterElm(settings.characters.length, settings, newCharacter, renameReporter).trim();
    charactersList.appendChild(item.firstChild!);
    settings.characters.push(newCharacter);
    updateSettings(vscode, settings, renameReporter);
  });

  const addAppButton = document.querySelector('#add-app-button')!;
  addAppButton.addEventListener('click', () => {
    const item = document.createElement('div');
    const newApp = MakeApp();
    item.innerHTML = appElm(settings.apps.length, newApp).trim();
    appList.appendChild(item.firstChild!);
    settings.apps.push(newApp);
    updatePreview(appList.lastChild as HTMLElement, settings);
    updateAppName(settings, charactersList);
    updateSettings(vscode, settings, renameReporter);
  });

  document.addEventListener('click', function (event) {
    const target = event.target as HTMLElement;
    if (target.matches('.codicon-close, .close-button-inner')) {
      const container = target.closest('.container') as HTMLDivElement;
      const index = Number(container.dataset.index);
      if (container.classList.contains("character")) {
        settings.characters.splice(index, 1);
        renameReporterUpdate(container, '', renameReporter);
      } else if (container.classList.contains("attribute")) {
        const character = container.parentElement?.closest(".character") as HTMLDivElement;
        const characterIndex = Number(character?.dataset.index);
        settings.characters[characterIndex].attributes.splice(index, 1);
        renameReporterUpdate(container, '', renameReporter);
      } else if (container.classList.contains("app")) {
        settings.apps.splice(index, 1);
        updateAppName(settings, charactersList);
      }
      const parent = container.parentNode as HTMLDivElement;
      container.parentNode?.removeChild(container);
      updateIndex(parent);
      updateSettings(vscode, settings, renameReporter);
    }
  });

  charactersList.addEventListener('click', function (event) {
    const target = event.target as HTMLElement;

    if (target.matches('.add-attr-button')) {
      const button = target as HTMLButtonElement;
      const parent = button.closest(".character") as HTMLDivElement;
      const attributeRoot = parent.querySelector(".attribute-root") as HTMLDivElement;
      const attrItem = document.createElement('div');
      const index = Number(parent.dataset.index);
      const newAttribute = MakeAttribute();
      attrItem.innerHTML = attributeElm(settings.characters[index].attributes.length, settings.characters[index], newAttribute, renameReporter).trim();
      attributeRoot.appendChild(attrItem.firstChild!);
      settings.characters[index].attributes.push(newAttribute);
      updateSettings(vscode, settings, renameReporter);
    }

    if (target.matches('.inherit-color-check')) {
      const inheritColorCheck = target as HTMLInputElement;
      const container = inheritColorCheck.closest('.attribute') as HTMLDivElement;
      if (container) {
        const inputColor = container.querySelector('input[type=color]') as HTMLInputElement;
        const dropdownColor = container.querySelector('.color-code') as HTMLDivElement;
        if(inheritColorCheck.checked){
          inputColor.setAttribute("disabled", "");
          dropdownColor.setAttribute("disabled", "");
        } else {
          inputColor.removeAttribute("disabled");
          dropdownColor.removeAttribute("disabled");
        }
      }

      getAttributeSetting(container, settings).colorInherit = inheritColorCheck.checked;
      updateSettings(vscode, settings, renameReporter);
    }
  });

  appList.addEventListener('keyup', function (event) {
    const target = event.target as HTMLInputElement;
    if(target.matches('.app-name')){
      if(duplicateCheck(target as HTMLInputElement, '#apps-list', '.app-name')) return;
      const newName = (target as HTMLInputElement).value;
      if(newName === "") return;
      updateTitle(target);
      const app = getAppSetting(target, settings);
      settings.characters.forEach((character) => {
        if(character.appName === app.appName) character.appName = newName;
      });
      app.appName = newName;
      updateSettings(vscode, settings, renameReporter);
    } else if(target.matches('.output-rule')){
      getAppSetting(target, settings).outputRule = target.value;
      updatePreview(target, settings);
      updateSettings(vscode, settings, renameReporter);
    } else if(target.matches('.save-file-ext')){
      getAppSetting(target, settings).saveFileExt = target.value;
      updateSettings(vscode, settings, renameReporter);
    }
  });
  appList.addEventListener('change', function (event) {
    const target = event.target as HTMLElement;
    if(target.matches('.app-name')){
      if(duplicateCheck(target as HTMLInputElement, '#apps-list', '.app-name')) return;
      const newName = (target as HTMLInputElement).value;
      if(newName === "") return;
      updateAppName(settings, charactersList);
    } else if(target.matches('.enable-clipboard')){
      getAppSetting(target, settings).enableClipboard = (target as HTMLInputElement).checked;
      updateSettings(vscode, settings, renameReporter);
    } else if(target.matches('.enable-save-file')){
      getAppSetting(target, settings).enableSaveFile = (target as HTMLInputElement).checked;
      updateSettings(vscode, settings, renameReporter);
    } else if(target.matches('.api-selector')){
      getAppSetting(target, settings).api = (target as HTMLInputElement).value;
      updateSettings(vscode, settings, renameReporter);
    }
  });

  charactersList.addEventListener('keyup', function (event) {
    const target = event.target as HTMLElement;
    if(target.matches('.character-name')){
      if(duplicateCheck(target as HTMLInputElement, '#characters-list', '.character-name')) return;
      const newName = (target as HTMLInputElement).value;
      if(newName === "") return;
      updateTitle(target);
      getCharacterSetting(target, settings).characterName = newName;
      renameReporterUpdate(target, newName, renameReporter);
      updateSettings(vscode, settings, renameReporter);
    } else if(target.matches('.character-description')){
      getCharacterSetting(target, settings).description = (target as HTMLInputElement).value;
      updateSettings(vscode, settings, renameReporter);
    } else if(target.matches('.color-code')){
      updateColor(target);
      if(target.closest('.attribute') !== null){
        getAttributeSetting(target, settings).color = (target as HTMLInputElement).value;
      } else {
        getCharacterSetting(target, settings).color = (target as HTMLInputElement).value;
      }
      updateSettings(vscode, settings, renameReporter);
    } else if(target.matches('.attribute-name')){
      if(duplicateCheck(target as HTMLInputElement, '.attribute-root', '.attribute-name')) return;
      const newName = (target as HTMLInputElement).value;
      if(newName === "") return;
      getAttributeSetting(target, settings).attr = newName;
      renameReporterUpdate(target, newName, renameReporter);
      updateSettings(vscode, settings, renameReporter);
    }
  });

  charactersList.addEventListener('change', function (event) {
    const target = event.target as HTMLElement;
    if (target.matches('.color-input, .color-code')) {
      updateColor(target, true);
      if(target.closest('.attribute') !== null){
        getAttributeSetting(target, settings).color = (target as HTMLInputElement).value;
      } else {
        getCharacterSetting(target, settings).color = (target as HTMLInputElement).value;
      }
      updateSettings(vscode, settings, renameReporter);
    } else if(target.matches('.character-app-selector')){
      getCharacterSetting(target, settings).appName = (target as HTMLInputElement).value;
      updateSettings(vscode, settings, renameReporter);
    }
  });

  document.querySelectorAll('.output-preview').forEach((target) => {
    updatePreview(target as HTMLElement, settings);
  });
}

function updateApiKeyButtonState(enableAssistant: boolean){
  const setApiKeyButton = document.querySelector('#set-apikey-button')! as HTMLButtonElement;
  const updateApiKeyButton = document.querySelector('#update-apikey-button')! as HTMLButtonElement;
  const deleteApiKeyButton = document.querySelector('#delete-apikey-button')! as HTMLButtonElement;
  if(enableAssistant){
    setApiKeyButton.setAttribute('hidden', '');
    updateApiKeyButton.removeAttribute('hidden');
    deleteApiKeyButton.removeAttribute('hidden');
  } else {
    setApiKeyButton.removeAttribute('hidden');
    updateApiKeyButton.setAttribute('hidden', '');
    deleteApiKeyButton.setAttribute('hidden', '');
  }
}

function initializeExtensionView(vscode: VSCode, settings: Settings, renameReporter:RenameReporter){
  const extensionRoot = document.querySelector('#extension-view')!;
  extensionRoot.innerHTML = extensionView(settings);

  const apiKeyInput = extensionRoot.querySelector('#copy-clipbord-per-app')! as HTMLInputElement;
  apiKeyInput.addEventListener('change', function (event) {
    const target = event.target as HTMLInputElement;
    settings.extension.separateCopy = target.checked;
    updateSettings(vscode, settings, renameReporter);
  });
}

function initializeAssistantView(vscode: VSCode, settings: Settings, renameReporter:RenameReporter, enableAssistant: boolean){
  const assistantRoot = document.querySelector('#assistant-view')!;
  assistantRoot.innerHTML = assistantView(settings, enableAssistant);
  
  const apiKeyInput = assistantRoot.querySelector('#apikey-input')! as HTMLInputElement;
  const setApiKeyButton = assistantRoot.querySelector('#set-apikey-button')! as HTMLButtonElement;
  const updateApiKeyButton = assistantRoot.querySelector('#update-apikey-button')! as HTMLButtonElement;
  const deleteApiKeyButton = assistantRoot.querySelector('#delete-apikey-button')! as HTMLButtonElement;
  const updateApiKey = () => {
    if(apiKeyInput.value !== ""){
      vscode.postMessage({
        command: 'update-api-key',
        data: apiKeyInput.value
      });
    }
  }
  setApiKeyButton.addEventListener('click', updateApiKey)
  updateApiKeyButton.addEventListener('click', updateApiKey)
  deleteApiKeyButton.addEventListener('click', () => {
    vscode.postMessage({
      command: 'update-api-key',
      data: null
    });
  });

  const promptInput = assistantRoot.querySelector('#assistant-prompt')! as HTMLInputElement;
  const resetPromptButton = assistantRoot.querySelector('#reset-assistant-prompt')! as HTMLButtonElement;
  
  promptInput.addEventListener('keyup', (event) => {
      const target = event.target as HTMLInputElement;
      settings.assistant.conversationPrompt = target.value;
      updateSettings(vscode, settings, renameReporter);
  });
  resetPromptButton.addEventListener('click', () => {
    const defaultPrompt = "空欄一人分のみ";
    settings.assistant.conversationPrompt = defaultPrompt;
    promptInput.value = defaultPrompt;
    updateSettings(vscode, settings, renameReporter);
  });
}

function initializeAppView(settings: Settings){
  const appRoot = document.querySelector('#app-view')!;
  appRoot.innerHTML = appView(settings);
}

function initializeCharacterView(settings: Settings, renameReporter: RenameReporter){
  const characterRoot = document.querySelector('#characters-view')!;
  characterRoot.innerHTML = characterView(settings, renameReporter);
}

const regCharacterName = new RegExp('\\' + VarCharacterName, 'g');
const regAttribute = new RegExp('\\' + VarAttribute, 'g');
const regCBody = new RegExp('\\' + VarBody, 'g');
function updatePreview(target: HTMLElement, settings: Settings) {
  let container = target as HTMLDivElement;
  if(!target.matches('.app')){
    container = target.closest('.container') as HTMLDivElement;
  }
  const preview = container.querySelector('.output-preview') as HTMLDivElement;
  const outputRule = (container.querySelector(".output-rule") as HTMLInputElement).value;
  const appName = (container.querySelector(".app-name") as HTMLInputElement).value;
  let characterName = "葵";
  let attribute = "元気"
  for(let i = 0; i < settings.characters.length; i++){
    if(settings.characters[i].appName === appName){
      characterName = settings.characters[i].characterName;
      if(settings.characters[i].attributes.length > 0){
        attribute = settings.characters[i].attributes[0].attr;
      }
      break;
    }
  }
  const body = "サンプルの文章です";
  const previewStr = outputRule.replace(regCharacterName, characterName).replace(regAttribute, attribute).replace(regCBody, body);
  preview.textContent = previewStr;
}

function normalizeColorCode(colorCode: string, fix: boolean = false) {
  if (!colorCode.startsWith("#")) {
    colorCode = "#" + colorCode;
  }
  if (colorCode.length === 4) {
    colorCode = "#" + colorCode[1] + colorCode[1] + colorCode[2] + colorCode[2] + colorCode[3] + colorCode[3];
  }
  if (/^#[0-9A-Fa-f]{6}$/.test(colorCode)) {
    return colorCode;
  }
  return null;
}

function updateColor(target: HTMLElement, fix: boolean = false) {
  if(target instanceof HTMLInputElement && target.getAttribute("type") === "color"){
    const colorInput = target as HTMLInputElement;
    const colorCode = colorInput.nextElementSibling as HTMLInputElement;
    colorCode.value = colorInput.value;
    updateContainerColor(target, colorInput.value)
  } else {
    const colorCode = target as HTMLInputElement;
    const colorInput = colorCode.previousElementSibling as HTMLInputElement;
    const code = normalizeColorCode(colorCode.value);
    if(code !== null){
      colorInput.value = code;
      updateContainerColor(target, colorInput.value)
    } else if(fix){
        const regex = /[^0-9a-fA-F]/g;
        colorCode.value = '#' + colorCode.value.replace(regex, '').slice(0, 6);
    }
  }
}

function updateContainerColor(target: HTMLElement, color: string) {
  const container = target.closest('.container') as HTMLDivElement;
  container.style.borderColor = color;
}

function duplicateCheck(target: HTMLInputElement, rootSelector: string, inputSelector: string) {
  const container = target.closest(rootSelector) as HTMLDivElement;
  const name = target.value;
  let duplicate = false;
  container.querySelectorAll<HTMLInputElement>(inputSelector).forEach((element) => {
    if(target !== element && element.value === name){
      duplicate = true;
    }
  });
  if(target.nextElementSibling){
    if(duplicate){
      target.nextElementSibling.innerHTML = "<div class='duplicate'>エラー：重複しています</div>";
    } else {
      target.nextElementSibling.innerHTML = "";
    }
  }
  return duplicate;
}

function updateTitle(target: HTMLElement) {
  const container = target.closest('.container') as HTMLDivElement;
  const title = container.querySelector('.title') as HTMLDivElement;
  title.textContent = (target as HTMLInputElement).value;
}

function updateAppName(settings: Settings, charactersList: HTMLElement) {
  const characters = charactersList.querySelectorAll('.character') as NodeListOf<HTMLDivElement>;
  characters.forEach((character) => {
    const dropdown = character.querySelector('.character-app-selector')!;
    if(dropdown.childElementCount < settings.apps.length){
      for(let i = dropdown.childElementCount; i < settings.apps.length; i++){
        const option = document.createElement('vscode-option');
        option.textContent = "";
        dropdown.appendChild(option);
      }
    }
    const min = Math.min(dropdown.childElementCount, settings.apps.length);
    let i = 0;
    for(; i < min; i++){
        const option = dropdown.children[i] as HTMLOptionElement;
        option.textContent = settings.apps[i].appName;
    }
    if(dropdown.childElementCount > min){
      for(; i < dropdown.childElementCount; i++){
        dropdown.removeChild(dropdown.children[i]);
      }
    }
  });
}

function updateIndex(containerParent: HTMLDivElement) {
  const containers = containerParent.children;
  let containerCounter = 0;
  for (let i = 0; i < containers.length; i++) {
    if(containers[i].classList.contains("container")){ 
      containers[i].setAttribute('data-index', containerCounter.toString());
      containerCounter++;
    }
  }
}

function getAppSetting(elm: HTMLElement, settings: Settings) {
  if(!elm.matches(".app")){ 
    elm = elm.closest('.app') as HTMLElement;
  }
  const index = Number(elm.dataset.index);
  return settings.apps[index];
}

function getCharacterSetting(elm: HTMLElement, settings: Settings) {
  if(!elm.matches(".character")){ 
    elm = elm.closest('.character') as HTMLElement;
  }
  const index = Number(elm.dataset.index);
  return settings.characters[index];
}

function getAttributeSetting(elm: HTMLElement, settings: Settings) {
  if(!elm.matches(".attribute")){ 
    elm = elm.closest('.attribute') as HTMLElement;
  }
  const index = Number(elm.dataset.index);
  const charIndex = Number((elm.closest('.character') as HTMLElement).dataset.index);
  return settings.characters[charIndex].attributes[index];
}

function limitNumber(input: string, min: number, max: number): number {
  let result: number = 0;
  const num: number = parseInt(input, 10);
  if (!isNaN(num) && num >= min && num <= max) {
    result = num;
  } else if (num < min) {
    result = min;
  } else if (num > max) {
    result = max;
  }
  return result;
}

function renameReporterUpdate(elm: HTMLElement, newName: string, renameReporter: RenameReporter){
  if(!elm.matches(".container")){ 
    elm = elm.closest('.container') as HTMLElement;
  }
  if(elm.matches(".attribute")){ 
    const character = elm.closest('.character') as HTMLElement;
    if(elm.dataset.original){
      renameReporter.renameAttribute(elm.dataset.original!, newName, character.dataset.original!);
    }
  } else {
    if(elm.dataset.original){
      renameReporter.renameCharacter(elm.dataset.original!, newName);
    }
  }
}

function updateSettings(vscode: VSCode, settings: Settings, renameReporter: RenameReporter) {
  vscode.postMessage({
    command: 'update',
    data: {settings, renameReporter}
  });
}

(window as any).initialize = initialize;
