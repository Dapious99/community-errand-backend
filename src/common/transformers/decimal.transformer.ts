import { ValueTransformer } from "typeorm";

/**
 * TypeORM returns Postgres `decimal`/`numeric` columns as strings to avoid
 * precision loss. Since none of these columns need arbitrary precision, we
 * transform them to plain numbers so API consumers (mobile/web) get numeric
 * JSON values instead of strings.
 */
export class DecimalColumnTransformer implements ValueTransformer {
  to(data: any): any {
    return data;
  }

  from(data: any): number | null | undefined {
    if (data === null || data === undefined) {
      return data;
    }
    return parseFloat(data);
  }
}
