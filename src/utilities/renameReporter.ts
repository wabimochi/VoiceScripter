import { Settings } from '../settings';
export interface RenameReport {
    newName : string;
}

export class RenameReporter {
    private _rename : {
        [name: string]: {
            newName : string;
            [attr: string]: string;
        }
    } = {};

    public initialize(settings: Settings) {
        for(let i = 0; i < settings.characters.length; i++) {
            const characterName = settings.characters[i].characterName;
            this._rename[characterName] = {
                newName: characterName,
            };

            for(let j = 0; j < settings.characters[i].attributes.length; j++) {
                const attrName = settings.characters[i].attributes[j].attr;
                this._rename[characterName][attrName] = attrName
            }
        }
    }
    
    public initializeFromRenameReporter(renameReporter: RenameReporter) {
        this._rename = renameReporter._rename;
    }

    public renameCharacter(oldName : string, newName : string) {
        this._rename[oldName].newName = newName;
    }
    
    public renameAttribute(oldName : string, newName : string, characterName : string) {
        this._rename[characterName][oldName] = newName;
    }

    public getOldCharacterName(newName : string) {
        for(let key in this._rename) {
            if(this._rename[key].newName === newName) {
                return key;
            }
        }
        return "";
    }

    public getOldAttributeName(newName : string, newCharacterName : string) {
        const oldCharacterName = this.getOldCharacterName(newCharacterName);
        for(let key in this._rename[oldCharacterName]) {
            if(this._rename[oldCharacterName][key] === newName) {
                return key;
            }
        }
        return "";
    }

    public getNewCharacterName(oldName : string) {
        if(this._rename[oldName]){
            return this._rename[oldName].newName;
        } else {
            return undefined;
        }
    }

    public getNewAttributeName(oldName : string, oldCharacterName : string) {
        if(this._rename[oldCharacterName]){
            return this._rename[oldCharacterName][oldName];
        } else {
            return undefined;
        }
    }
}