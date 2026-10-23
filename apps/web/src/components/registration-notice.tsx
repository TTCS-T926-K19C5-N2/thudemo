import { REGISTRATION_NOTICE } from "shared/registration-notice";
import { Info } from "@/components/ui/material-icon";

export function RegistrationNotice() {
  return (
    <section
      className="registration-privacy"
      aria-labelledby="registration-notice-title"
    >
      <div className="registration-privacy-heading">
        <Info filled />
        <div>
          <span>QUYỀN RIÊNG TƯ</span>
          <h2 id="registration-notice-title">{REGISTRATION_NOTICE.title}</h2>
        </div>
      </div>
      <div className="registration-privacy-copy">
        {REGISTRATION_NOTICE.paragraphs.map((text) => (
          <p key={text}>{text}</p>
        ))}
      </div>
    </section>
  );
}
