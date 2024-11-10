import {
  DiscordGatewayAdapterCreator,
  entersState,
  joinVoiceChannel,
  VoiceConnection,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import {
  Attachment,
  Client,
  Collection,
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
  TOP_FIVE = "top5",
  STATISTICS = "stats",
}

const MAX_COMMAND_CHOICES = 25;

export class CowBot {
  private client: Client;
  private soundManager: SoundManager;
  private currentConnection?: VoiceConnection;

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

    setInterval(() => {
      this.exitIfAlone();
    }, 1000 * 60 * 10);
  };

  private exitIfAlone = async () => {
    if (this.currentConnection) {
      const channelId = this.currentConnection.joinConfig.channelId;
      const guildId = this.currentConnection.joinConfig.guildId;

      const guild = await this.client.guilds.cache
        .find((guild) => guild.id === guildId)
        .fetch();
      const channel = await guild.channels.fetch(channelId);

      if (
        !Player.getInstance().isPlaying() ||
        (channel.members instanceof Collection && channel.members.size === 1)
      ) {
        console.log("Player in Idle or alone, disconecting...");
        this.currentConnection.destroy();
        this.currentConnection = undefined;
      }
    }
  };

  private generateSoundCommands = async () => {
    const sounds = await this.soundManager.sounds();
    const soundsCount = sounds.length;
    const commandsNeeded = Math.ceil(soundsCount / MAX_COMMAND_CHOICES);
    const commands = [
      new SlashCommandBuilder()
        .setName("sound")
        .setDescription("Plays a sound from library")
        .addStringOption((option) =>
          option
            .setName("sound")
            .setDescription("Sound to play")
            .setRequired(true)
            .addChoices(sounds.slice(0, MAX_COMMAND_CHOICES))
        ),
    ];

    for (let i = 1; i < commandsNeeded; i++) {
      const suggestions = sounds.slice(
        i * MAX_COMMAND_CHOICES,
        MAX_COMMAND_CHOICES * (i + 1)
      );

      commands.push(
        new SlashCommandBuilder()
          .setName(`sound${i}`)
          .setDescription("Plays a sound from library")
          .addStringOption((option) =>
            option
              .setName("sound")
              .setDescription("Sound to play")
              .setRequired(true)
              .addChoices(suggestions)
          )
      );
    }

    return commands;
  };

  private generateRemoveCommands = async () => {
    const sounds = await this.soundManager.sounds();
    const soundsCount = sounds.length;
    const commandsNeeded = Math.ceil(soundsCount / MAX_COMMAND_CHOICES);
    const commands = [
      new SlashCommandBuilder()
        .setName("remove")
        .setDescription("Remove a sound from library")
        .addStringOption((option) =>
          option
            .setName("name")
            .setRequired(true)
            .setDescription("Sound to be removed")
            .addChoices(sounds.slice(0, MAX_COMMAND_CHOICES))
        ),
    ];

    for (let i = 1; i < commandsNeeded; i++) {
      const suggestions = sounds.slice(
        i * MAX_COMMAND_CHOICES,
        MAX_COMMAND_CHOICES * (i + 1)
      );

      commands.push(
        new SlashCommandBuilder()
          .setName(`remove${i}`)
          .setDescription("Remove a sound from library")
          .addStringOption((option) =>
            option
              .setName("name")
              .setRequired(true)
              .setDescription("Sound to be removed")
              .addChoices(suggestions)
          )
      );
    }

    return commands;
  };

  private registerCommands = async () => {
    try {
      const sounds = await this.soundManager.sounds();
      const commands = [
        ...(await this.generateSoundCommands()),
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
        ...(await this.generateRemoveCommands()),
        new SlashCommandBuilder()
          .setName("top5")
          .setDescription("Shows the TOP FIVE most played sounds"),
        new SlashCommandBuilder()
          .setName("stats")
          .setDescription("Displays the bot's statistics"),
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

      const sound = await this.soundManager.findSound(soundToPlay.toString());

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

      this.currentConnection = connection;

      connection.subscribe(Player.getInstance().getPlayer());

      Player.getInstance().play(sound);

      if (interaction.isRepliable()) {
        await interaction.reply("Playing now!");
      }

      await this.soundManager.increaseSoundPlayCount(sound.value);
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

  private topFive = async (interaction: CommandInteraction) => {
    try {
      const topFive = await this.soundManager.topFive();
      const rows = [
        "***TOP FIVE SOUNDS***",
        ...topFive.map(
          (sound, index) =>
            `**${index + 1}.** ${sound.name}  (${sound.playCount}x played)`
        ),
      ];

      return interaction.reply(rows.join("\n"));
    } catch (err) {
      console.log(err);
      interaction.reply("Failed to get the top five").catch(err);
    }
  };

  private statistics = async (interaction: CommandInteraction) => {
    try {
      const statistics = await this.soundManager.statistics();

      return interaction.reply(
        `***COWBOT STATISTICS***\n` +
          `Total Sounds: ${statistics.totalSounds}\n` +
          `Total Plays: ${statistics.totalPlays ?? 0}`
      );
    } catch (err) {
      console.log(err);
      interaction.reply("Failed to get the statistics").catch(err);
    }
  };

  private setupListerners = async () => {
    this.client.on("ready", async () => {
      console.log("CowBot is ready to play!");
    });

    this.client.on("interactionCreate", async (interaction: Interaction) => {
      const commandInteraction = interaction as CommandInteraction;
      const cleanCommand = commandInteraction.commandName.replaceAll(
        /[0-9]/g,
        ""
      );
      switch (cleanCommand) {
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
        case Actions.TOP_FIVE:
          this.topFive(commandInteraction);
          break;
        case Actions.STATISTICS:
          this.statistics(commandInteraction);
          break;
        default:
          commandInteraction.reply("Unknown command").catch(noOp);
          break;
      }
    });
  };

  private login = async () => this.client.login(Config.getInstance().token);
}
