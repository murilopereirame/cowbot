import fs from "node:fs";

export interface Sound {
  value: string;
  name: string;
  file: string;
}

export class SoundManager {
  private soundsList: Sound[];
  private soundsLookupTable: Map<string, number> = new Map();

  constructor() {
    const sounds = (JSON.parse(fs.readFileSync("config/sounds.json", "utf8")) ??
      []) as Sound[];

    sounds.forEach((sound, index) =>
      this.soundsLookupTable.set(sound.value, index)
    );

    this.soundsList = sounds;
  }

  get sounds() {
    return this.soundsList;
  }

  findSound = (name: string): Sound | undefined =>
    this.soundsList[this.soundsLookupTable.get(name) ?? -1];

  addSound = (fileIdentifier: string, name: string) => {
    const newIndex =
      this.soundsList.push({
        name,
        value: fileIdentifier,
        file: `sounds/${fileIdentifier}`,
      }) - 1;

    this.soundsLookupTable.set(fileIdentifier, newIndex);

    const encodedSoundsList = JSON.stringify(this.soundsList);
    fs.writeFileSync("config/sounds.json", encodedSoundsList);
  };

  removeSound = (soundIdentifier: string) => {
    const soundIndex = this.soundsLookupTable.get(soundIdentifier) ?? -1;

    if (soundIndex == null) {
      return false;
    }

    const sound = this.sounds[soundIndex];

    fs.unlinkSync(sound.file);

    this.soundsLookupTable.delete(soundIdentifier);
    this.sounds.splice(soundIndex, 1);

    const encodedSoundsList = JSON.stringify(this.soundsList);
    fs.writeFileSync("config/sounds.json", encodedSoundsList);

    return true;
  };
}
