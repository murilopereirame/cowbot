import fs from "node:fs";

export class Config {
  private static instance: Config;
  private botToken: string;
  private botClientId: string;
  private serverGuildId: string;

  constructor() {
    this.loadConfigs();
  }

  static getInstance = (): Config => {
    if (!this.instance) {
      this.instance = new Config();
    }

    return this.instance;
  };

  private loadConfigs = () => {
    const { token, clientId, guildId } = JSON.parse(
      fs.readFileSync("config/config.json", "utf8")
    );

    this.botToken = token;
    this.botClientId = clientId;
    this.serverGuildId = guildId;
  };

  get token() {
    return this.botToken;
  }

  get clientId() {
    return this.botClientId;
  }

  get guildId() {
    return this.serverGuildId;
  }
}
