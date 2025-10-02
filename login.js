// Redireciona se já estiver logado
if (localStorage.getItem("adminLogado") === "true") {
  window.location.href = "painel.html";
}

// Usuários de teste
const usuariosTeste = [
  { email: "merendeira@escola.com", senha: "123456" },
  { email: "admin@escola.com", senha: "abcdef" }
];

// Elementos
const form = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const senhaInput = document.getElementById("senha");
const msg = document.getElementById("msg");
const btn = document.getElementById("btnLogin");

// Função para mostrar mensagens
function mostrarMensagem(texto, tipo = "erro") {
  msg.textContent = texto;
  msg.className = `mt-3 text-center font-bold ${
    tipo === "sucesso" ? "text-green-500" : "text-red-500"
  }`;
}

// Login
form.addEventListener("submit", (e) => {
  e.preventDefault();

  // Ativa loading no botão
  btn.disabled = true;
  btn.innerHTML = `<span class="loading loading-spinner"></span> Entrando...`;

  setTimeout(() => {
    const email = emailInput.value.trim();
    const senha = senhaInput.value.trim();

    const usuarioValido = usuariosTeste.find(
      (u) => u.email === email && u.senha === senha
    );

    if (usuarioValido) {
      localStorage.setItem("adminLogado", "true");
      mostrarMensagem("✅ Login realizado com sucesso!", "sucesso");
      setTimeout(() => (window.location.href = "painel.html"), 1000);
    } else {
      mostrarMensagem("❌ Email ou senha inválidos!");
      emailInput.classList.add("input-error");
      senhaInput.classList.add("input-error");
      btn.disabled = false;
      btn.innerHTML = "Entrar";
    }
  }, 1000); // Simula tempo de verificação
});
