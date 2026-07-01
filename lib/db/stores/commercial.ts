/** Commercial aggregate queries (dashboard stats). */
import { db } from "../connection"

export const commercialDb = {
  totalQuotedValue(): number { return (db.prepare("SELECT COALESCE(SUM(quoteValue),0) as v FROM Job WHERE quoteValue > 0").get() as { v: number }).v },
  totalIssuedValue(): number { return (db.prepare("SELECT COALESCE(SUM(quoteValue),0) as v FROM Job WHERE status='ISSUED' AND quoteValue > 0").get() as { v: number }).v },
  avgJobValue():      number { return (db.prepare("SELECT COALESCE(AVG(quoteValue),0) as v FROM Job WHERE quoteValue > 0").get() as { v: number }).v },
}
