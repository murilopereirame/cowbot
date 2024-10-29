import {
  AudioPlayer,
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  StreamType,
} from "@discordjs/voice";
import { Sound } from "./SoundManager.js";

class Player {
  private static instance?: Player;
  private player: AudioPlayer;

  constructor() {
    this.player = createAudioPlayer();
  }

  public static getInstance(): Player {
    if (!this.instance) {
      this.instance = new Player();
    }

    return this.instance;
  }

  getPlayer = () => this.player;

  play = async (sound: Sound) => {
    if (this.player.state.status !== AudioPlayerStatus.Idle) {
      await this.stop();
    }

    const resource = createAudioResource(sound.file, {
      inputType: StreamType.Arbitrary,
    });

    this.player.play(resource);

    return entersState(this.player, AudioPlayerStatus.Playing, 5000);
  };

  stop = async () => {
    this.player.stop(true);
  };
}

export default Player;
