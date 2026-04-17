import postgres from "postgres";
import { FEATURE_WEIGHTS } from "@tcabr/shared";

const url = process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function main() {
  const sql = postgres(url, { onnotice: () => {} });

  await sql.begin(async (tx) => {
    await tx`
      insert into feature_weights_meta (version, max_raw, scale, updated_at)
      values (${FEATURE_WEIGHTS.version},
              ${FEATURE_WEIGHTS.normalization.max_raw},
              ${FEATURE_WEIGHTS.normalization.scale},
              now())
      on conflict (version) do update
        set max_raw = excluded.max_raw,
            scale = excluded.scale,
            updated_at = now();
    `;
    for (const f of FEATURE_WEIGHTS.features) {
      await tx`
        insert into feature_weight (id, weight, description, updated_at)
        values (${f.id}, ${f.weight}, ${f.description}, now())
        on conflict (id) do update
          set weight = excluded.weight,
              description = excluded.description,
              updated_at = now();
      `;
    }
  });

  const rows = await sql`select id, weight from feature_weight order by id`;
  console.log(`seeded ${rows.length} feature weights`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
