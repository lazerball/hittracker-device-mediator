import { Body, ContentType, Get, JsonController, NotFoundError, Param, Post} from 'routing-controllers';

import * as ble from '../ble';

import { logger } from '../logging';

@JsonController()
export class UnitController {
  private timer: NodeJS.Timer;

  @Post('/unit/:address/:value')
  @ContentType('application/json')
  public async unitToggle(
    @Param('address') address: string,
    @Param('value') value: number,
  ) {

    if (!ble.seenPeripheralAddress(address)) {
      throw new NotFoundError(`Peripheral ${address} was not found`);
    }
    logger.debug(`Setting unit ${address} status to ${value}`);
    try {
      ble.stopScanning();
      await ble.setPeripheralValue(address, value);
      this.timer = setTimeout(() => {
        ble.startScanning();
      }, 3000);
    } catch (error) {
      logger.error(error);
    }
    return {msg: `Setting unit ${address} status to ${value}`};
  }

  @Get('/unit')
  @ContentType('application/json')
  public async unitList() {
    return Object.keys(ble.seenPeripherals);
  }


}
