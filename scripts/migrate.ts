/** Additive schema only. Never seed/reset flights, codes, or passenger data. */
import { getDb, migrate } from "../src/lib/db";
async function main() {
  const remote = !!(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  if (remote && !process.argv.includes("--remote"))
    throw new Error(
      "Remote DB detected. Use --remote only for the intended database.",
    );
  await migrate(await getDb());
  console.log(
    `Schema applied (${remote ? "remote" : "local"}). No seed data was changed.`,
  );
}
void main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Migration failed");
    process.exit(1);
  });
