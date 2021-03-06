import * as vscode from 'vscode';

export class ReferenceProvider implements vscode.ReferenceProvider {
    private files: vscode.Uri[] = [];

    public provideReferences(
        document: vscode.TextDocument, position: vscode.Position,
        options: { includeDeclaration: boolean }, token: vscode.CancellationToken):
        Thenable<vscode.Location[] | null> {

        var promise = vscode.workspace.findFiles(new vscode.RelativePattern(vscode.workspace.rootPath as string, '{**/*.xml}')).then((res) => {
            this.files = res;
            return this.processSearch(document, position);
        });

        return promise;
    }


    public static getSelectedWord(document: vscode.TextDocument, position: vscode.Position): string {

        // Get the selected word
        const wordPosition = document.getWordRangeAtPosition(position);
        if (!wordPosition) return "";

        //const word1 = document.getText(wordPosition).toLowerCase();

        // Temporary workaround for separated word with dash (-) or dot (.)
        const line = document.lineAt(position.line).text;

        // Search for the quotation marks
        let startWord = line.lastIndexOf('"', wordPosition.start.character);
        let endWord = line.indexOf('"', wordPosition.end.character);
        let word2 = line.substring(startWord + 1, endWord).toLowerCase();

        // In case of XML body element, search for the <> marks
        if (word2 === "" || word2.indexOf(">") > 0 || word2.indexOf("<") > 0) {
            startWord = line.lastIndexOf('>', wordPosition.start.character);
            endWord = line.indexOf('<', wordPosition.end.character);
            word2 = line.substring(startWord + 1, endWord).toLowerCase();
        }

        return word2;
    }

    private processSearch(
        document: vscode.TextDocument,
        position: vscode.Position): Thenable<vscode.Location[] | null> {

        var DOMParser = require('xmldom').DOMParser;
        let promises_array: Array<any> = [];
        let list: vscode.Location[] = [];
        var fs = require('fs');

        for (const file of this.files) {
            promises_array.push(new Promise((resolve: any) => fs.readFile(file.fsPath, 'utf8', function (err: any, data: any) {
                resolve(new FileData(file, data));
            })));

        }

        const word = ReferenceProvider.getSelectedWord(document, position);

        if (word.length == 0)
            return Promise.resolve(null);

        return Promise.all(promises_array)
            .then((files: any) => {

                for (let file of files) {
                    var data = file.Data.replace(/( )(Id=|Id =|Id  =)/gi, " id=");
                    var doc = new DOMParser().parseFromString(data.toLowerCase());
                    var listLength: number = list.length;

                    // Technical profiles
                    this.searchElement(doc, list, file.Uri, "TechnicalProfile", "Id", word);
                    this.searchElement(doc, list, file.Uri, "ValidationTechnicalProfile", "ReferenceId", word);
                    this.searchElement(doc, list, file.Uri, "ClaimsExchange", "TechnicalProfileReferenceId", word);
                    this.searchElement(doc, list, file.Uri, "OrchestrationStep", "CpimIssuerTechnicalProfileReferenceId", word);
                    this.searchElement(doc, list, file.Uri, "UseTechnicalProfileForSessionManagement", "ReferenceId", word);
                    this.searchElement(doc, list, file.Uri, "IncludeTechnicalProfile", "ReferenceId", word);

                    //Policy name
                    if (list.length == listLength) {
                        this.searchElement(doc, list, file.Uri, "TrustFrameworkPolicy", "PolicyId", word);
                        this.searchElement(doc, list, file.Uri, "PolicyId", null, word);
                    }

                    //Claim definitios
                    if (list.length == listLength) {
                        this.searchElement(doc, list, file.Uri, "OutputClaim", "ClaimTypeReferenceId", word);
                        this.searchElement(doc, list, file.Uri, "InputClaim", "ClaimTypeReferenceId", word);
                        this.searchElement(doc, list, file.Uri, "Value", null, word);
                        this.searchElement(doc, list, file.Uri, "LocalizedCollection", "ElementId", word);
                        this.searchElement(doc, list, file.Uri, "LocalizedString", "ElementId", word);
                        this.searchElement(doc, list, file.Uri, "SubjectNamingInfo", "ClaimType", word);
                        this.searchElement(doc, list, file.Uri, "PersistedClaim", "ClaimTypeReferenceId", word);
                    }
                    //Claim Transformation
                    if (list.length == listLength) {
                        this.searchElement(doc, list, file.Uri, "ClaimsTransformation", "Id", word);
                        this.searchElement(doc, list, file.Uri, "InputClaimsTransformation", "ReferenceId", word);
                        this.searchElement(doc, list, file.Uri, "OutputClaimsTransformation", "ReferenceId", word);
                    }

                    //User journey
                    if (list.length == listLength) {
                        this.searchElement(doc, list, file.Uri, "UserJourney", "Id", word);
                        this.searchElement(doc, list, file.Uri, "DefaultUserJourney", "ReferenceId", word);
                    }

                    //Content definition
                    if (list.length == listLength) {
                        this.searchElement(doc, list, file.Uri, "ContentDefinition", "Id", word);
                        this.searchElement(doc, list, file.Uri, "OrchestrationStep", "ContentDefinitionReferenceId", word);
                        this.searchElement(doc, list, file.Uri, "Item", null, word);
                    }

                    //LocalizedResourcesReference
                    if (list.length == listLength) {
                        this.searchElement(doc, list, file.Uri, "LocalizedResourcesReference", "LocalizedResourcesReferenceId", word);
                        this.searchElement(doc, list, file.Uri, "LocalizedResources", "Id", word);
                    }

                    //ClientDefinition
                    if (list.length == listLength) {
                        this.searchElement(doc, list, file.Uri, "ClientDefinition", "Id", word);
                        this.searchElement(doc, list, file.Uri, "ClientDefinition", "ReferenceId", word);
                    }
                }

                if (list.length > 0)
                    return Promise.resolve(list);
                else
                    return Promise.resolve(null);
            });
    }

    private searchElement(
        doc: any,
        list: vscode.Location[],
        uri: vscode.Uri,
        elementTagName: string,
        elementAttribute: string | null,
        word: string) {

        elementTagName = elementTagName.toLowerCase();

        if (elementAttribute != null)
            elementAttribute = elementAttribute.toLowerCase();

        var elements = doc.getElementsByTagName(elementTagName);

        var i: number;
        for (i = 0; i < elements.length; i++) {

            const element = elements[i];
            // If search returns items, add the items to the location arry
            if (element != null &&
                ((elementAttribute != null && (element.getAttribute(elementAttribute) === word)) ||
                    (elementAttribute === null && (element.textContent === word)))) {
                let start: vscode.Position = new vscode.Position(element.lineNumber - 1, element.columnNumber - 1);
                let end: vscode.Position = new vscode.Position(element.lineNumber, 0);

                let loc = new vscode.Location(uri, new vscode.Range(start, end));

                list.push(loc);
            }
        }
    }

}

export class FileData {
    public Uri: vscode.Uri;
    public Data: string;

    constructor(uri: vscode.Uri, data: string) {
        this.Uri = uri;
        this.Data = data;
    }
}