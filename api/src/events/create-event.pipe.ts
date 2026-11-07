import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { CreateEventDto } from './create-event.dto';

@Injectable()
export class CreateEventPipe implements PipeTransform<CreateEventDto> {
  transform(input: CreateEventDto): CreateEventDto {
    if (input.rowCount * input.seatsPerRow > 100000) {
      throw new BadRequestException('An event cannot have more than 100,000 seats.');
    }
    const assignedRows = new Set<number>();
    for (const zone of input.zones) {
      if (zone.startRow > zone.endRow || zone.endRow >= input.rowCount) {
        throw new BadRequestException('Zone ranges must be ordered and within the event rows.');
      }
      for (let row = zone.startRow; row <= zone.endRow; row++) {
        if (assignedRows.has(row)) throw new BadRequestException(`Row ${row} is assigned more than once.`);
        assignedRows.add(row);
      }
    }
    if (assignedRows.size !== input.rowCount) {
      throw new BadRequestException('Every row must belong to exactly one zone.');
    }
    return input;
  }
}
