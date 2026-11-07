import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

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

@Entity('zones')
@Unique(['eventId', 'name'])
export class ZoneEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'event_id' })
  eventId!: string;

  @Column('text')
  name!: string;

  @Column('int', { name: 'price_agorot' })
  priceAgorot!: number;
}

@Entity('event_rows')
@Unique(['eventId', 'rowIndex'])
@Unique(['eventId', 'label'])
export class EventRowEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'event_id' })
  eventId!: string;

  @Column('uuid', { name: 'zone_id' })
  zoneId!: string;

  @Column('int', { name: 'row_index' })
  rowIndex!: number;

  @Column('text')
  label!: string;
}

@Entity('seats')
@Unique(['rowId', 'number'])
export class SeatEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'event_id' })
  eventId!: string;

  @Column('uuid', { name: 'row_id' })
  rowId!: string;

  @Column('int')
  number!: number;
}
