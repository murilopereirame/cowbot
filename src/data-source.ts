import "reflect-metadata";
import { DataSource } from "typeorm";
import { Sound } from "./entity/Sound.js";

export const AppDataSource = new DataSource({
  type: "sqlite",
  database: "config/cowbot.sqlite",
  synchronize: true,
  logging: false,
  entities: [Sound],
  migrations: [],
  subscribers: [],
});
