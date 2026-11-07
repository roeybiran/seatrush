import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AccountService {
  constructor(private readonly dataSource: DataSource) {}

  async orders(username: string) {
    const seats: Array<{
      orderId: string;
      holdId: string;
      eventId: string;
      eventName: string;
      venue: string;
      eventTime: Date;
      rowIndex: number;
      seatNumber: number;
      priceAgorot: number;
    }> = await this.dataSource.query(`
      SELECT orders.id AS "orderId", hold.id AS "holdId", event.id AS "eventId",
        event.name AS "eventName", event.venue, event.event_time AS "eventTime",
        seat.row_index AS "rowIndex", seat.number AS "seatNumber", seat.price_agorot AS "priceAgorot"
      FROM orders
      JOIN holds AS hold ON hold.id = orders.hold_id
      JOIN events AS event ON event.id = hold.event_id
      JOIN seats AS seat ON seat.event_id = hold.event_id AND seat.hold_id = hold.id
      WHERE hold.username = $1
      ORDER BY event.event_time, orders.id, seat.row_index, seat.number
    `, [username]);

    const orders: Array<{
      id: string;
      holdId: string;
      eventId: string;
      event: { name: string; venue: string; eventTime: Date };
      seats: Array<{ rowIndex: number; seatNumber: number; priceAgorot: number }>;
      totalAgorot: number;
    }> = [];
    for (const seat of seats) {
      let order = orders.at(-1);
      if (!order || order.id !== seat.orderId) {
        order = {
          id: seat.orderId,
          holdId: seat.holdId,
          eventId: seat.eventId,
          event: { name: seat.eventName, venue: seat.venue, eventTime: seat.eventTime },
          seats: [],
          totalAgorot: 0,
        };
        orders.push(order);
      }
      order.seats.push({ rowIndex: seat.rowIndex, seatNumber: seat.seatNumber, priceAgorot: seat.priceAgorot });
      order.totalAgorot += seat.priceAgorot;
    }
    return orders;
  }
}
