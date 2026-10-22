import { REGISTRATION_NOTICE } from "shared/registration-notice";

export function RegistrationNotice() {
  return (
    <section aria-labelledby="registration-notice-title">
      <h2 id="registration-notice-title">{REGISTRATION_NOTICE.title}</h2>
      {REGISTRATION_NOTICE.paragraphs.map((text) => (
        <p key={text}>{text}</p>
      ))}
    </section>
  );
}
