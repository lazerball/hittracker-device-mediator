import { Body, ContentType, Get, JsonController, NotFoundError, Param, Post } from 'routing-controllers';

import * as ble from '../ble';
import { GameConfiguration } from '../util';

import { logger } from '../logging';

@JsonController()
export class GameController {
  private gameTimer: any;
  private gameActive: boolean;

  @Post('/start')
  @ContentType('application/json')
  public async start(
    @Body({ required: true, validate: true })
    gameConfiguration: GameConfiguration
  ) {
    logger.debug(`Starting Game with configuration: ${JSON.stringify(gameConfiguration)}`);
    try {
      await ble.startGame(gameConfiguration);
    } catch (error) {
      logger.error(error);
    }

    this.gameTimer = setTimeout((config: GameConfiguration) => {
      ble.stopGame(config);
    }, gameConfiguration.gameLength * 1000, gameConfiguration);

    return { msg: 'Started Game' };
  }

  @Post('/stop')
  @ContentType('application/json')
  public async stop(
    @Body({ required: true, validate: true })
    gameConfiguration: GameConfiguration
  ) {
    logger.debug('Stopping Game');

    if (this.gameTimer) {
      clearTimeout(this.gameTimer);
    }
    try {
      await ble.stopGame(gameConfiguration);
    } catch (error) {
      logger.error(error);
    }
    return { msg: 'Stopped Game' };
  }
}
