import "reflect-metadata";

import { CowBot } from "./CowBot.js";
import { SoundManager } from "./SoundManager.js";
import { AppDataSource } from "./data-source.js";

AppDataSource.initialize()
  .then(async () => new CowBot(new SoundManager()))
  .catch((error) => console.log(error));
