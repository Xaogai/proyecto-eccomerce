/** Une clases CSS y descarta las vacías: cx('a', cond && 'b') */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
