document.addEventListener("DOMContentLoaded", () => {
  // Smooth scrolling for anchor links
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute("href"));
      if (target) {
        target.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    });
  });

  // Navbar scroll effect
  const navbar = document.querySelector(".navbar");
  window.addEventListener("scroll", () => {
    if (window.scrollY > 20) {
      navbar.style.background = "rgba(255, 255, 255, 0.95)";
      navbar.style.boxShadow = "0 1px 2px 0 rgba(0, 0, 0, 0.05)";
    } else {
      navbar.style.background = "rgba(255, 255, 255, 0.8)";
      navbar.style.boxShadow = "none";
    }
  });

  // Simple fade-in animation for hero image
  const heroImage = document.querySelector(".hero-visual img");
  if (heroImage) {
    heroImage.style.opacity = "0";
    heroImage.style.transform = "translateY(20px)";
    heroImage.style.transition = "opacity 0.8s ease, transform 0.8s ease";

    setTimeout(() => {
      heroImage.style.opacity = "1";
      heroImage.style.transform = "translateY(0)";
    }, 300);
  }
});

function copyToClipboard() {
  const codeElement = document.getElementById("gatekeeper-cmd");
  const text = codeElement.innerText;
  const button = document.querySelector(".btn-copy");
  const originalText = button.innerHTML;

  navigator.clipboard.writeText(text).then(() => {
    button.innerHTML = "<span>Copied!</span>";
    button.style.background = "#059669"; // Green success color
    setTimeout(() => {
      button.innerHTML = originalText;
      button.style.background = "";
    }, 2000);
  });
}
