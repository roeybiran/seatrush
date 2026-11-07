import { Column, Entity, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';

@Entity('events')
export class EventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('text')
  name!: string;

  @Column('text')
  venue!: string;

  @Column('timestamptz', { name: 'event_time' })
  eventTime!: Date;

  @Column('timestamptz', { name: 'drop_time' })
  dropTime!: Date;

  @Column('int', { name: 'row_count' })
  rowCount!: number;

  @Column('int', { name: 'seats_per_row' })
  seatsPerRow!: number;
}

@Entity('seats')
export class SeatEntity {
  @PrimaryColumn('uuid', { name: 'event_id' })
  eventId!: string;

  @PrimaryColumn('int', { name: 'row_index' })
  rowIndex!: number;

  @PrimaryColumn('int')
  number!: number;

  @Column('int', { name: 'zone_index' })
  zoneIndex!: number;

  @Column('int', { name: 'price_agorot' })
  priceAgorot!: number;

  @Column('uuid', { name: 'hold_id', nullable: true })
  holdId!: string | null;
}
