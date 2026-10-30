import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

export interface TicketConfirmationProps {
  buyerName: string;
  eventTitle: string;
  when: string;
  venue: string;
  lines: Array<{ name: string; quantity: number; amount: string }>;
  gifts: Array<{ recipient: string; summary: string }>;
  total: string;
  reference: string;
  ticketsUrl: string;
}

export default function TicketConfirmationEmail({
  buyerName,
  eventTitle,
  when,
  venue,
  lines,
  gifts,
  total,
  reference,
  ticketsUrl,
}: TicketConfirmationProps) {
  const firstName = buyerName.split(" ")[0] || "there";
  return (
    <Html>
      <Head />
      <Preview>{`You're going to ${eventTitle}`}</Preview>
      <Tailwind>
        <Body className="bg-gray-50 font-sans">
          <Container className="mx-auto my-8 max-w-md rounded-2xl bg-white px-8 py-8">
            <Text className="m-0 text-xs font-semibold uppercase tracking-wide text-blue-600">Ticket confirmed</Text>
            <Heading className="mt-2 mb-1 text-2xl font-bold text-gray-900">{eventTitle}</Heading>
            <Text className="m-0 text-sm text-gray-600">{when}</Text>
            {venue ? <Text className="m-0 text-sm text-gray-600">{venue}</Text> : null}

            <Text className="mt-6 text-sm text-gray-700">
              Hi {firstName}, your payment went through. Show your Outsiders QR code or tap your card at the
              entrance.
            </Text>

            <Section className="mt-4 rounded-xl bg-gray-50 px-4 py-2">
              {lines.map((line) => (
                <Text key={line.name} className="my-2 text-sm text-gray-800">
                  {line.quantity} × {line.name}
                  <span className="float-right font-semibold">{line.amount}</span>
                </Text>
              ))}
              <Hr className="my-2 border-gray-200" />
              <Text className="my-2 text-sm font-bold text-gray-900">
                Total paid
                <span className="float-right">{total}</span>
              </Text>
            </Section>

            {gifts.length > 0 ? (
              <Section className="mt-4">
                <Text className="mb-1 text-sm font-semibold text-gray-900">Tickets you sent</Text>
                {gifts.map((gift) => (
                  <Text key={gift.recipient} className="my-1 text-sm text-gray-700">
                    {gift.recipient}: {gift.summary}
                  </Text>
                ))}
                <Text className="mt-1 text-xs text-gray-500">They&apos;ll find them in their Outsiders tickets.</Text>
              </Section>
            ) : null}

            <Button href={ticketsUrl} className="mt-6 block rounded-xl bg-blue-600 px-5 py-3 text-center text-sm font-semibold text-white">
              View your tickets
            </Button>

            <Text className="mt-6 text-xs text-gray-400">Reference {reference}</Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

TicketConfirmationEmail.PreviewProps = {
  buyerName: "Ada Obi",
  eventTitle: "Afrobeats Rooftop Night",
  when: "Sat, 14 Nov · 8:00 pm",
  venue: "12 Admiralty Way, Lekki, Lagos",
  lines: [
    { name: "Regular", quantity: 2, amount: "₦5,000.00" },
    { name: "VIP", quantity: 1, amount: "₦8,000.00" },
  ],
  gifts: [{ recipient: "Tunde B.", summary: "1 × Regular" }],
  total: "₦13,000.00",
  reference: "TXN-TKT-ABC123",
  ticketsUrl: "https://app.outsiderbyremy.com/tickets",
} satisfies TicketConfirmationProps;
