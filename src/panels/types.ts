export interface Panel {
  id: string;
  name: string;
  blurb: string;
  render(): HTMLElement;
}
