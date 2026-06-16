declare module 'adm-zip' {
  export default class AdmZip {
    constructor(buffer?: string | Buffer);
    extractAllTo(targetPath: string, overwrite?: boolean): void;
  }
}
