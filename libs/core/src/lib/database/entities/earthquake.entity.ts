import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";
import { CudDatesEntity } from "./cud-dates.entity";

@Entity({ name: 'earthquakes' })
export class EarthquakeEntity extends CudDatesEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('decimal', { precision: 3, scale: 1 })
  force: number;

  @Column('decimal', { precision: 5, scale: 2 })
  longitude: number;

  @Column('decimal', { precision: 5, scale: 2 })
  latitude: number;

  @Column()
  date: Date;
}