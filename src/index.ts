import { config as loadDotenv } from 'dotenv';
import { Command } from 'commander';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { statusCommand } from './commands/status.js';
import { configCommand } from './commands/config.js';
import { contextCommand } from './commands/context.js';
import { productsCommand } from './commands/products.js';
import { featuresCommand } from './commands/features.js';
import { initCommand } from './commands/init.js';
import { analyticsCommand } from './commands/analytics.js';
import { setJsonMode } from './utils/output.js';

loadDotenv({ path: '.env.local' });
loadDotenv();

const program = new Command();

program
  .name('shyft')
  .description('CLI for the Shyft platform')
  .version(__CLI_VERSION__)
  .option('--json', 'Output in JSON format')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.json) {
      setJsonMode(true);
    }
  });

program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(statusCommand);
program.addCommand(configCommand);
program.addCommand(contextCommand);
program.addCommand(productsCommand);
program.addCommand(featuresCommand);
program.addCommand(initCommand);
program.addCommand(analyticsCommand);

export function run(): void {
  program.parse();
}
