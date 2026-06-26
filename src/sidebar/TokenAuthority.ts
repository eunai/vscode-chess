export interface TokenAuthority {
  mint(identity: string): string;
}
