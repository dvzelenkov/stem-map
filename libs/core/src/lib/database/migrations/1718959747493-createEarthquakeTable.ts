import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateEarthquakeTable1718959747493 implements MigrationInterface {
    name = 'CreateEarthquakeTable1718959747493'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "earthquakes" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" SERIAL NOT NULL, "force" numeric(3,1) NOT NULL, "longitude" numeric(5,2) NOT NULL, "latitude" numeric(5,2) NOT NULL, "date" TIMESTAMP NOT NULL, CONSTRAINT "PK_8a06d6d0352ace49f767fc6feb7" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "earthquakes"`);
    }

}
