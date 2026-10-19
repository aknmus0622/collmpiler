/**
 * Pure decisions and calculations of the mutation judge. They read only their arguments.
 */

/**
 * Corresponds to the specification's calculation `valueInAdapterNow`.
 *
 * @param numeric the `BeginValue` command's `numeric`: whether the value is a number
 * @param inAdapter the `BeginValue` command's `inAdapter`: whether the value appears in the adapter
 * @returns the value to remember as `data.valueInAdapter`
 */
export function valueInAdapterNow(numeric: boolean, inAdapter: boolean): boolean {
  return numeric && inAdapter;
}

/**
 * Corresponds to the specification's calculation `locatedNow`.
 *
 * @param located the specification's `data.located`, as remembered before this `EndValue`
 * @param sawSite the specification's `data.sawSite` for the value whose sites are over
 * @returns the value to remember as `data.located`
 */
export function locatedNow(located: boolean, sawSite: boolean): boolean {
  return located || sawSite;
}

/**
 * Corresponds to the specification's calculation `anyKilledNow`.
 *
 * @param anyKilled the specification's `data.anyKilled`, as remembered before this `Mutant`
 * @param killed the `Mutant` command's `killed`
 * @returns the value to remember as `data.anyKilled`
 */
export function anyKilledNow(anyKilled: boolean, killed: boolean): boolean {
  return anyKilled || killed;
}

/**
 * Pure decision. Whether `EndValue` emits the specification's `Survived` effect.
 *
 * @param sawSite the specification's `data.sawSite` for the value whose sites are over
 * @param siteKilled the specification's `data.siteKilled` for that value
 * @returns true when `Survived` is to be emitted
 */
export function survives(sawSite: boolean, siteKilled: boolean): boolean {
  return sawSite && !siteKilled;
}

/**
 * Pure decision. Whether `EndValue` emits the specification's `InAdapter` effect.
 *
 * @param sawSite the specification's `data.sawSite` for the value whose sites are over
 * @param valueInAdapter the specification's `data.valueInAdapter` for that value
 * @returns true when `InAdapter` is to be emitted
 */
export function isInAdapter(sawSite: boolean, valueInAdapter: boolean): boolean {
  return !sawSite && valueInAdapter;
}

/**
 * Pure decision. Whether `Finish` emits the specification's `Ineffective` effect.
 *
 * @param located the specification's `data.located`
 * @param anyKilled the specification's `data.anyKilled`
 * @param shared the `Finish` command's `shared`
 * @returns true when `Ineffective` is to be emitted
 */
export function isIneffective(located: boolean, anyKilled: boolean, shared: boolean): boolean {
  return !located && !anyKilled && !shared;
}
