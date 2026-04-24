const yearNode = document.querySelector("#year");
if (yearNode) {
  yearNode.textContent = String(new Date().getFullYear());
}

const downloadButton = document.querySelector("#downloadButton");
if (downloadButton) {
  downloadButton.addEventListener("click", (event) => {
    if (downloadButton.getAttribute("href") === "#") {
      event.preventDefault();
      window.alert("请先将下载链接替换为正式发布地址。");
    }
  });
}
