import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class Sound {
  @Column({ primary: true, unique: true, type: "varchar" })
  value: string;

  @Column({ type: "varchar" })
  name: string;

  @Column({ type: "varchar" })
  file: string;

  @Column({ type: "int" })
  playCount: number;
}
