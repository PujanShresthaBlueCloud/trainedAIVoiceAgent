import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <SignIn
        appearance={{
          elements: {
            footerAction: { display: "none" },
          },
        }}
      />
    </div>
  );
}
