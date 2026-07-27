/**
 * One-off CLI seed script for creating an admin account - there is no public
 * admin signup endpoint. Run via `npm run admin:create -- --email=... --name=... --password=...`.
 *
 * Uses the same data-source (src/config/data-source.ts) as migrations, which
 * runs under ts-node outside the app's own runtime TypeORM connection.
 */
import * as bcrypt from 'bcrypt';
import dataSource from '../src/config/data-source';
import { Admin } from '../src/admin/entities/admin.entity';

function parseArgs(): { email?: string; name?: string; password?: string } {
  const args: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) {
      args[match[1]] = match[2];
    }
  }
  return args;
}

async function main() {
  const { email, name, password } = parseArgs();

  if (!email || !name || !password) {
    console.error(
      'Usage: npm run admin:create -- --email=you@example.com --name="Ops" --password="..."'
    );
    process.exit(1);
  }

  await dataSource.initialize();

  const repo = dataSource.getRepository(Admin);
  const existing = await repo.findOne({ where: { email } });
  if (existing) {
    console.error(`An admin with email "${email}" already exists.`);
    await dataSource.destroy();
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = repo.create({ email, name, passwordHash });
  await repo.save(admin);

  console.log(`Admin created: ${admin.email} (${admin.id})`);
  await dataSource.destroy();
}

main().catch(async (error) => {
  console.error('Failed to create admin:', error.message);
  await dataSource.destroy();
  process.exit(1);
});
