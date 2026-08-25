// ─── KARTY SZANSA I KASA SPOŁECZNA — edytuj dowolnie! ────────────────────────

export type CardEffect =
  | { kind: 'money'; amount: number }              // +zbierasz / -płacisz do banku
  | { kind: 'money-each'; amount: number }         // +/- od każdego gracza
  | { kind: 'move-abs'; target: number }           // jedź na pole (przejście START => +200)
  | { kind: 'move-rel'; delta: number }            // cofnij się o N pól
  | { kind: 'jail' }                               // idź do więzienia
  | { kind: 'jailcard' }                           // karta "wyjdź z więzienia"
  | { kind: 'repairs'; house: number; hotel: number }

export interface CardDef {
  text: string
  effect: CardEffect
}

export const CARDS_CHANCE: CardDef[] = [
  { text: 'Przejdź na pole START i zbierz 200.', effect: { kind: 'move-abs', target: 0 } },
  { text: 'Jedź na Sopot. Jeśli przejedziesz przez START, zbierz 200.', effect: { kind: 'move-abs', target: 39 } },
  { text: 'Jedź na Dworzec Południowy. Jeśli przejedziesz przez START, zbierz 200.', effect: { kind: 'move-abs', target: 5 } },
  { text: 'Zwrot podatku dochodowego — zbierz 20.', effect: { kind: 'money', amount: 20 } },
  { text: 'Twoja firma wypłaciła dywidendę — zbierz 50.', effect: { kind: 'money', amount: 50 } },
  { text: 'Cofnij się o 3 pola.', effect: { kind: 'move-rel', delta: -3 } },
  { text: 'Zostałeś przyłapany na przekroczeniu prędkości — zapłać 15.', effect: { kind: 'money', amount: -15 } },
  { text: 'Idź do więzienia. Nie przechodzisz przez START.', effect: { kind: 'jail' } },
  { text: 'Karta "Wyjdź z więzienia za darmo". Zachowaj ją na później.', effect: { kind: 'jailcard' } },
  { text: 'Remont dróg: zapłać 25 za każdy domek i 100 za każdy hotel.', effect: { kind: 'repairs', house: 25, hotel: 100 } },
  { text: 'Jedź na Dworzec Zachodni. Jeśli przejedziesz przez START, zbierz 200.', effect: { kind: 'move-abs', target: 15 } },
  { text: 'Jedź na Bydgoszcz. Jeśli przejedziesz przez START, zbierz 200.', effect: { kind: 'move-abs', target: 37 } },
  { text: 'Zostałeś wybrany prezesem rady nadzorczej — zapłać każdemu graczowi po 50.', effect: { kind: 'money-each', amount: -50 } },
  { text: 'Odzyskałeś kaucję — zbierz 100.', effect: { kind: 'money', amount: 100 } }
]

export const CARDS_CHEST: CardDef[] = [
  { text: 'Błąd w banku na Twoją korzyść — zbierz 200.', effect: { kind: 'money', amount: 200 } },
  { text: 'Zysk ze sprzedaży akcji — zbierz 50.', effect: { kind: 'money', amount: 50 } },
  { text: 'Nadpłata podatku — zbierz 20.', effect: { kind: 'money', amount: 20 } },
  { text: 'Idź do więzienia. Nie przechodzisz przez START.', effect: { kind: 'jail' } },
  { text: 'Karta "Wyjdź z więzienia za darmo". Zachowaj ją na później.', effect: { kind: 'jailcard' } },
  { text: 'Twoje urodziny! Każdy gracz daje Ci 10.', effect: { kind: 'money-each', amount: 10 } },
  { text: 'Spadłeś ze schodów i trafiłeś do szpitala — zapłać 100.', effect: { kind: 'money', amount: -100 } },
  { text: 'Składka ubezpieczeniowa — zapłać 50.', effect: { kind: 'money', amount: -50 } },
  { text: 'Wizyta u lekarza — zapłać 50.', effect: { kind: 'money', amount: -50 } },
  { text: 'Sprzedaż na targu staroci — zbierz 25.', effect: { kind: 'money', amount: 25 } },
  { text: 'Wygrałeś konkurs piękności — zbierz 10.', effect: { kind: 'money', amount: 10 } },
  { text: 'Odziedziczyłeś majątek — zbierz 100.', effect: { kind: 'money', amount: 100 } },
  { text: 'Grzywna za parkowanie — zapłać 15.', effect: { kind: 'money', amount: -15 } },
  { text: 'Zwrot z ubezpieczenia zdrowotnego — zbierz 100.', effect: { kind: 'money', amount: 100 } }
]
