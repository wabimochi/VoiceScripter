import * as vscode from 'vscode';
import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from 'openai';
import axios, { CancelToken } from 'axios';

interface OnChangeUsedTokenHandler {
    (usedToken: number): void;
}

export class ChatGptManager {
    private openai: OpenAIApi | undefined;
    private model: string;
    private usedToken : number;
    private onChangeUsedToken: OnChangeUsedTokenHandler | undefined;
    private outputChannel: vscode.OutputChannel | undefined;

    constructor(outputChannel: vscode.OutputChannel | undefined = undefined) {
        this.model = '';
        this.usedToken = 0;
        this.outputChannel = outputChannel;
    }

    public async initializeOpenai(apiKey: string, model:string, usageToken: number = 0) {
        if (apiKey === undefined) return;
        const configuration = new Configuration({
            apiKey: apiKey,
        });
        this.openai = new OpenAIApi(configuration);
        this.model = model;
        this.usedToken = usageToken;
    }

    public dispose() {
        this.openai = undefined;
        this.model = '';
        this.onChangeUsedToken = undefined;
        this.usedToken = 0;
    }

    get isEnable(): boolean {
        return this.openai !== undefined;
    }

    public getUsedToken(): number {
        return this.usedToken;
    }

    public SetChangeUsedTokenCallback(handler: OnChangeUsedTokenHandler): void {
        this.onChangeUsedToken = handler;
    }

    public async createChatCompletion(
        message: Array<ChatCompletionRequestMessage>,
        cancelToken: CancelToken
    ): Promise<string> {
        this.outputChannel?.appendLine('');
        this.outputChannel?.appendLine(message.map((v) => v.content).join('\n'));
        if(this.openai === undefined) throw new Error("OpenAI is not initialized");
        try{
            const response = await this.openai?.createChatCompletion({
                model: this.model,
                temperature: 1,
                n: 1,
                messages: message
            }, 
            {cancelToken:cancelToken});
            if (response.status === 200) {
                if(response.data.usage){
                    this.outputChannel?.appendLine(`Used Token { prompt:${response.data.usage.prompt_tokens} completion:${response.data.usage.completion_tokens} total:${response.data.usage.total_tokens} }`);
                    this.usedToken += response.data.usage.total_tokens;
                    if(this.onChangeUsedToken) {
                        this.onChangeUsedToken(this.usedToken);
                    }
                }
                if(response.data.choices.length > 0 && response.data.choices[0].message){
                    this.outputChannel?.appendLine(`response:${response.data.choices[0].message.content}`);
                    return response.data.choices[0].message.content;
                }
                return '';
            } else {
                this.outputChannel?.appendLine(`error:${response.status}`);
                throw new Error(response.status.toString());
            }
        } catch(error) {
            this.outputChannel?.appendLine(`error:${error}`);
            throw error;
        }
    }

    public getFormatedUsedToken(): string {
        const suffixes = ["", "k", "M", "G", "T", "P"];
        return this.formatNumber(this.usedToken, suffixes);
    }

    public getFormatedCost(): string {
        const suffixes = ["", "k", "m"];
        return '$'+ this.formatNumber(this.usedToken * 0.001 * 0.002, suffixes);
    }

    private formatNumber(value: number, suffixes : string[]): string {
        let prefixIndex = 0;
        while (value >= 1000 && prefixIndex < suffixes.length) {
          value /= 1000;
          prefixIndex++;
        }
      
        if(prefixIndex >= suffixes.length) return `999${suffixes[suffixes.length - 1]}+`
        const formattedValue = value.toPrecision(3);
        const suffix = suffixes[prefixIndex];
        if(formattedValue.includes('.')){
            return formattedValue.slice(0, 4) + suffix;
        }
      
        return formattedValue.slice(0, 3) + suffix;
    }
} 