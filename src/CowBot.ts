import {
  DiscordGatewayAdapterCreator,
  entersState,
  joinVoiceChannel,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import {
  Attachment,
  Client,
  CommandInteraction,
  GatewayIntentBits,
  Interaction,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import Player from "./Player.js";
import fs from "node:fs";
import { Config } from "./Config.js";
import type { SoundManager } from "./SoundManager.js";
import https from "node:https";
import { isAudioFile, noOp, randomHexString } from "./Utils.js";

enum Actions {
  PLAY = "sound",
  RELOAD = "reload",
  STOP = "stop",
  ADD_SOUND = "add",
  REMOVE_SOUND = "remove",
}

export class CowBot {
  private client: Client;
  private soundManager: SoundManager;

  constructor(soundManager: SoundManager) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
      ],
    });

    this.soundManager = soundManager;
    this.init();
  }

  private init = async () => {
    await this.registerCommands();
    await this.setupListerners();
    await this.login();
  };

  private registerCommands = async () => {
    try {
      const commands = [
        new SlashCommandBuilder()
          .setName("sound")
          .setDescription("Plays a sound from library")
          .addStringOption((option) =>
            option
              .setName("sound")
              .setDescription("Sound to play")
              .setRequired(true)
              .addChoices(this.soundManager.sounds)
          ),
        new SlashCommandBuilder()
          .setName("reload")
          .setDescription("Load newly added sounds"),
        new SlashCommandBuilder()
          .setName("stop")
          .setDescription("Stop current playing sound"),
        new SlashCommandBuilder()
          .setName("add")
          .setDescription("Adds a new sound to the bot")
          .addStringOption((option) =>
            option
              .setName("name")
              .setRequired(true)
              .setDescription("Name of the sound")
          )
          .addAttachmentOption((option) =>
            option
              .setName("sound")
              .setRequired(true)
              .setDescription("Sound to be added")
          ),
        new SlashCommandBuilder()
          .setName("remove")
          .setDescription("Remove a sound from library")
          .addStringOption((option) =>
            option
              .setName("name")
              .setRequired(true)
              .setDescription("Sound to be removed")
              .addChoices(this.soundManager.sounds)
          ),
      ].map((command) => command.toJSON());

      const rest = new REST({ version: "10" }).setToken(
        Config.getInstance().token
      );

      console.log(
        `Started refreshing application ${commands.length} commends.`
      );

      await rest.put(
        Routes.applicationGuildCommands(
          Config.getInstance().clientId,
          Config.getInstance().guildId
        ),
        {
          body: commands,
        }
      );

      console.log("Successfully reloaded application commands.");
    } catch (error) {
      console.log("Failed to reloaded application commands.");
      console.error(error);
    }
  };

  private playSound = async (interaction: CommandInteraction) => {
    try {
      const channel = interaction.guild?.members.cache.get(
        `${interaction.member?.user.id}`
      )?.voice.channel;

      if (!channel) {
        return interaction.reply("Join a voice channel then try again!");
      }

      const soundToPlay = interaction.options.get("sound")?.value;

      if (!soundToPlay) {
        return interaction.reply("Select a sound to play!");
      }

      const sound = this.soundManager.findSound(soundToPlay.toString());

      if (!sound) {
        return interaction.reply("Sound not registered!");
      }

      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: interaction.guild
          .voiceAdapterCreator as DiscordGatewayAdapterCreator,
      });

      await entersState(connection, VoiceConnectionStatus.Ready, 30000);

      connection.subscribe(Player.getInstance().getPlayer());

      Player.getInstance().play(sound);

      if (interaction.isRepliable()) {
        await interaction.reply("Playing now!");
      }
    } catch (err) {
      console.log(err);
      interaction.reply("Failed to play sound").catch(noOp);
    }
  };

  private downloadAttachment = async (url: string): Promise<string> => {
    const soundId = randomHexString();
    const tempFile = `sounds/${soundId}`;
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(tempFile);
      https
        .get(url, (response) => {
          if (response.statusCode !== 200) {
            return reject(
              new Error(`Failed to get '${url}' (${response.statusCode})`)
            );
          }

          response.pipe(file);

          file.on("finish", () => {
            file.close();

            if (!isAudioFile(tempFile)) {
              fs.unlinkSync(tempFile);
              return reject("Invalid file type");
            }

            return resolve(soundId);
          });
        })
        .on("error", (err) => {
          fs.unlinkSync(tempFile);
          reject(err);
        });
    });
  };

  private removeSound = async (interaction: CommandInteraction) => {
    try {
      const soundIdentifier = interaction.options.get("name")?.value;

      if (!soundIdentifier) {
        return interaction.reply("Missing sound name!");
      }

      if (!this.soundManager.removeSound(soundIdentifier.toString())) {
        return interaction.reply("Sound not found!");
      }

      await this.registerCommands();
      return interaction.reply("Sound removed!");
    } catch (error) {
      console.error(error);
      interaction.reply("Failed to remove sound!").catch(noOp);
    }
  };

  private addSound = async (interaction: CommandInteraction) => {
    try {
      const attachment = interaction.options.get("sound").attachment;

      if (!attachment) {
        return interaction.reply("Missing sound to be added in attachment!");
      }

      const soundName = interaction.options.get("name")?.value;

      if (!soundName) {
        return interaction.reply("Missing sound name!");
      }

      const downloadedAttachment = await this.downloadAttachment(
        attachment.url
      );

      this.soundManager.addSound(downloadedAttachment, soundName.toString());
      this.registerCommands();
      interaction.reply(`Sound ${soundName} added!`);
    } catch (error) {
      console.error(error);
      interaction.reply("Failed to add sound").catch(noOp);
    }
  };

  private stopSound = async (interaction: CommandInteraction) => {
    try {
      await interaction.reply("Stopping...");
      await Player.getInstance().stop();
    } catch (err) {
      console.log(err);
      interaction.reply("Failed to stop").catch(noOp);
    }
  };

  private reloadCommands = async (interaction: CommandInteraction) => {
    try {
      await this.registerCommands();
      return interaction.reply("Commands reloaded");
    } catch (err) {
      console.log(err);
      interaction.reply("Failed to reload commands").catch(err);
    }
  };

  private setupListerners = async () => {
    this.client.on("ready", async () => {
      console.log("CowBot is ready to play!");
    });

    this.client.on("interactionCreate", async (interaction: Interaction) => {
      const commandInteraction = interaction as CommandInteraction;
      switch (commandInteraction.commandName) {
        case Actions.PLAY:
          this.playSound(commandInteraction);
          break;
        case Actions.RELOAD:
          this.reloadCommands(commandInteraction);
          break;
        case Actions.STOP:
          this.stopSound(commandInteraction);
          break;
        case Actions.ADD_SOUND:
          this.addSound(commandInteraction);
          break;
        case Actions.REMOVE_SOUND:
          this.removeSound(commandInteraction);
          break;
        default:
          commandInteraction.reply("Unknown command").catch(noOp);
          break;
      }
    });
  };

  private login = async () => this.client.login(Config.getInstance().token);
}
