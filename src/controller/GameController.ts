
import { Body, ContentType, Get, JsonController, Post} from 'routing-controllers';

import * as ble from '../ble';
import { GameConfiguration } from '../util';

import { logger } from '../logging';

@JsonController()
export class GameController {
  @Post('/start')
  @ContentType('application/json')
  public async start(
    @Body({ required: true, validate: true })
    gameConfiguration: GameConfiguration,
  ) {
    logger.debug(`Starting Game with configuration: ${JSON.stringify(gameConfiguration)}`);
    try {
      await ble.startGame(gameConfiguration);
    } catch (error) {
      logger.error(error);
    }
    return 'Started Game';
  }

  @Post('/stop')
  @ContentType('application/json')
  public async stop(
    @Body({ required: true, validate: true })
    gameConfiguration: GameConfiguration,
  ) {
    logger.debug('Stopping Game');
    try {
      await ble.stopGame(gameConfiguration);
    } catch (error) {
      logger.error(error);
    }
    return 'Stopped Game';
  }
}
