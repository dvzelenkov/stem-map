import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";
import { CudDatesEntity } from "./cud-dates.entity";
import { DecimalColumnTransformer } from "../transformers/decimal-column.transformer";

@Entity({ name: 'earthquakes' })
export class EarthquakeEntity extends CudDatesEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('decimal', {
    scale: 1,
    precision: 3,
    transformer: new DecimalColumnTransformer(),
  })
  force: number;

  @Column('decimal', {
    scale: 2,
    precision: 5,
    transformer: new DecimalColumnTransformer(),
  })
  longitude: number;

  @Column('decimal', {
    scale: 2,
    precision: 5,
    transformer: new DecimalColumnTransformer(),
  })
  latitude: number;

  @Column()
  date: Date;
}