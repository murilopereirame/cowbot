import fs from "node:fs";
import { AppDataSource } from "./data-source.js";
import { Sound } from "./entity/Sound.js";

export class SoundManager {
  constructor() {}

  sounds = async (): Promise<Sound[]> => {
    const soundsRepository = AppDataSource.getRepository(Sound);
    return await soundsRepository.find();
  };

  findSound = async (name: string): Promise<Sound | null> => {
    const soundsRepository = AppDataSource.getRepository(Sound);
    return await soundsRepository.findOne({ where: { value: name } });
  };

  addSound = async (fileIdentifier: string, name: string) => {
    const file = `sounds/${fileIdentifier}`;
    const sound = new Sound();
    sound.file = file;
    sound.name = name;
    sound.value = fileIdentifier;
    sound.playCount = 0;

    const soundsRepository = AppDataSource.getRepository(Sound);
    soundsRepository.save(sound);
  };

  removeSound = async (soundIdentifier: string) => {
    const soundsRepository = AppDataSource.getRepository(Sound);
    const sound = await soundsRepository.findOne({
      where: { value: soundIdentifier },
    });

    if (sound == null) {
      return false;
    }

    fs.unlinkSync(sound.file);
    soundsRepository.remove(sound);

    return true;
  };

  increaseSoundPlayCount = async (soundIdentifier: string) => {
    const soundsRepository = AppDataSource.getRepository(Sound);
    const result = await soundsRepository.increment(
      { value: soundIdentifier },
      "playCount",
      1
    );

    return result.affected;
  };

  topFive = async (): Promise<Sound[]> => {
    const soundsRepository = AppDataSource.getRepository(Sound);
    const result = await soundsRepository.find({
      take: 5,
      order: { playCount: "DESC" },
    });

    return result;
  };

  statistics = async (): Promise<{
    totalSounds: number;
    totalPlays: number;
  }> => {
    const soundData = AppDataSource.getRepository(Sound)
      .createQueryBuilder("sound")
      .select("COUNT(*)", "totalSounds")
      .addSelect("SUM(playCount)", "totalPlays")
      .getRawOne();

    return soundData;
  };
}
