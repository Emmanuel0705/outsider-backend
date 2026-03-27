import * as React from "react";
import { Tailwind, Section, Text } from "@react-email/components";

export default function ResetPasswordOTPEmail({
  otp,
  name,
}: {
  otp: string;
  name: string;
}) {
  return (
    <Tailwind>
      <Section className="flex justify-center items-center w-full min-h-screen font-sans">
        <Section className="flex flex-col items-center w-76 rounded-2xl px-6 py-1 bg-gray-50">
          <Text className="text-xs font-medium text-violet-500">
            Reset Your Password
          </Text>
          <Text className="text-gray-500 my-0">
            Hi {name}, use the code below to reset your password.
          </Text>
          <Text className="text-5xl font-bold pt-2">{otp}</Text>
          <Text className="text-gray-400 font-light text-xs pb-4">
            This code is valid for 10 minutes
          </Text>
          <Text className="text-gray-600 text-xs">
            If you did not request a password reset, ignore this email.
          </Text>
        </Section>
      </Section>
    </Tailwind>
  );
}

ResetPasswordOTPEmail.PreviewProps = {
  otp: "847291",
  name: "Samuel",
};
