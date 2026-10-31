const ymd = (date: string) => date.replaceAll("-", "");

const ticketUrlTemplates: Record<
  string,
  {
    primary: (date: string) => string;
    resale?: (date: string) => string | string[];
  }
> = {
  巨人: {
    primary: (date: string) => {
      const [year, month] = date.split("-");
      return `https://www.giants.jp/schedule/first-team/?month=${year}${month}`;
    },
    resale: (date: string) => {
      const [year, month] = date.split("-");
      return `https://tradead.tixplus.jp/giants/buy/bidding?month=${Number(month)}&year=${year}`;
    },
  },
  DeNA: {
    primary: () => "https://ticket.baystars.co.jp/",
    resale: () => "https://ticket-resale.baystars.co.jp/purchase/match",
  },
  ヤクルト: {
    primary: () => "https://ticket.yakult-swallows.co.jp/Calendar.aspx",
    resale: (date: string) => {
      const [year, month] = date.split("-");
      return `https://tradead.tixplus.jp/swallows/buy/bidding?month=${Number(month)}&year=${year}`;
    },
  },
  阪神: {
    primary: () => "https://toraticket.pia.jp/",
  },
  広島: {
    primary: () => "https://www.carp.co.jp/ticket",
  },
  中日: {
    primary: () => "https://dragons-ticket.jp/Calendar.aspx",
    resale: (date: string) => {
      const [year, month] = date.split("-");
      return `https://tradead.tixplus.jp/dragons/buy/bidding?month=${Number(month)}&year=${year}`;
    },
  },
  西武: {
    primary: (date: string) =>
      `https://ticket.seibulions.jp/event/venue/${ymd(date).substring(2)}01`,
    resale: (date: string) => [
      `https://ticket.seibulions.jp/resale/venue/${ymd(date).substring(2)}01`,
      `https://www.ticket.co.jp/sys/d/20022.htm?st=${ymd(date)}`,
    ],
  },
  ロッテ: {
    primary: (date: string) =>
      `https://m-ticket.marines.co.jp/ticket/${ymd(date)}`,
    resale: (date: string) =>
      `https://www.ticket.co.jp/sys/d/20023.htm?st=${ymd(date)}`,
  },
  オリックス: {
    primary: (date: string) =>
      `https://buffaloes.cnplayguide.com/ticket/${ymd(date)}`,
    resale: (date: string) =>
      `https://www.ticket.co.jp/sys/d/20025.htm?st=${ymd(date)}`,
  },
  日本ハム: {
    primary: () => "https://ticket.fighters.co.jp/event/list/self/1",
    resale: (date: string) => [
      "https://ticket.fighters.co.jp/event/list/resale/1",
      `https://www.ticket.co.jp/sys/d/20026.htm?st=${ymd(date)}`,
    ],
  },
  ソフトバンク: {
    primary: () => "https://ticket.softbankhawks.co.jp/game/select",
  },
  楽天: {
    primary: (date: string) => {
      const [year, month, day] = date.split("-");
      return `https://eagles.tstar.jp/seat${year?.substring(2)}${month}${day}`;
    },
    resale: (date: string) => {
      const [year, month, day] = date.split("-");
      return `https://nft.rakuten.co.jp/marketplace/?type=ticket&sort=last_updated_date&limit=12&ticketlimit=6&provider=eagles&date=${`${day}-${month}-${year}`}`;
    },
  },
};

export const generateTicketUrls = (teamName: string, date: string) => {
  const template = ticketUrlTemplates[teamName];
  if (!template) return undefined;

  return {
    primary: template.primary(date),
    ...(template.resale && { resale: template.resale(date) }),
  };
};
