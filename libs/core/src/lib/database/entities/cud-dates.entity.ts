import { CreateDateColumn, DeleteDateColumn, UpdateDateColumn } from "typeorm";

export class CudDatesEntity {
  @CreateDateColumn({ name: 'created_at', default: () => 'CURRENT_TIMESTAMP' })
	createdAt?: Date;

	@UpdateDateColumn({ name: 'updated_at', default: () => 'CURRENT_TIMESTAMP' })
	updatedAt?: Date;

	@DeleteDateColumn({ name: 'deleted_at', nullable: true })
	deletedAt?: Date;
}