import { memo, useState } from "react";
import { publicAsset } from "@/utils/publicAsset";

interface OsConfig {
  name: string;
  image: string;
  keywords: string[];
}

const OS_NAME_SPLIT_REGEX = /[\s/]+/;

const OS_CONFIGS: OsConfig[] = [
  {
    name: "AlmaLinux",
    image: publicAsset("images/logo/os-alma.svg"),
    keywords: ["alma", "almalinux"],
  },
  {
    name: "Alpine Linux",
    image: publicAsset("images/logo/os-alpine.webp"),
    keywords: ["alpine", "alpine linux"],
  },
  {
    name: "Armbian",
    image: publicAsset("images/logo/os-armbian.svg"),
    keywords: ["armbian"],
  },
  {
    name: "CentOS",
    image: publicAsset("images/logo/os-centos.svg"),
    keywords: ["centos", "cent os"],
  },
  {
    name: "Debian",
    image: publicAsset("images/logo/os-debian.svg"),
    keywords: ["debian", "deb"],
  },
  {
    name: "FreeBSD",
    image: publicAsset("images/logo/os-freebsd.svg"),
    keywords: ["freebsd", "bsd"],
  },
  {
    name: "Ubuntu",
    image: publicAsset("images/logo/os-ubuntu.svg"),
    keywords: ["ubuntu", "elementary"],
  },
  {
    name: "Windows",
    image: publicAsset("images/logo/os-windows.svg"),
    keywords: ["windows", "win", "microsoft", "ms"],
  },
  {
    name: "Arch Linux",
    image: publicAsset("images/logo/os-arch.svg"),
    keywords: ["arch", "archlinux", "arch linux"],
  },
  {
    name: "Kali Linux",
    image: publicAsset("images/logo/os-kail.svg"),
    keywords: ["kail", "kali", "kali linux"],
  },
  {
    name: "iStoreOS",
    image: publicAsset("images/logo/os-istore.png"),
    keywords: ["istore", "istoreos", "istore os"],
  },
  {
    name: "OpenWrt",
    image: publicAsset("images/logo/os-openwrt.svg"),
    keywords: ["openwrt", "open wrt", "open-wrt", "qwrt"],
  },
  {
    name: "ImmortalWrt",
    image: publicAsset("images/logo/os-openwrt.svg"),
    keywords: ["immortalwrt", "immortal", "emmortal"],
  },
  {
    name: "NixOS",
    image: publicAsset("images/logo/os-nix.svg"),
    keywords: ["nixos", "nix os", "nix"],
  },
  {
    name: "Rocky Linux",
    image: publicAsset("images/logo/os-rocky.svg"),
    keywords: ["rocky", "rocky linux"],
  },
  {
    name: "Fedora",
    image: publicAsset("images/logo/os-fedora.svg"),
    keywords: ["fedora"],
  },
  {
    name: "openSUSE",
    image: publicAsset("images/logo/os-openSUSE.svg"),
    keywords: ["opensuse", "suse"],
  },
  {
    name: "Gentoo",
    image: publicAsset("images/logo/os-gentoo.svg"),
    keywords: ["gentoo"],
  },
  {
    name: "Red Hat",
    image: publicAsset("images/logo/os-redhat.svg"),
    keywords: ["redhat", "rhel", "red hat"],
  },
  {
    name: "Linux Mint",
    image: publicAsset("images/logo/os-mint.svg"),
    keywords: ["mint", "linux mint"],
  },
  {
    name: "Manjaro",
    image: publicAsset("images/logo/os-manjaro-.svg"),
    keywords: ["manjaro"],
  },
  {
    name: "Synology DSM",
    image: publicAsset("images/logo/os-synology.ico"),
    keywords: ["synology", "dsm", "synology dsm"],
  },
  {
    name: "fnOS",
    image: publicAsset("images/logo/os-fnos.ico"),
    keywords: ["fnos", "fnnas"],
  },
  {
    name: "Proxmox VE",
    image: publicAsset("images/logo/os-proxmox.ico"),
    keywords: ["proxmox", "proxmox ve"],
  },
  {
    name: "macOS",
    image: publicAsset("images/logo/os-macos.svg"),
    keywords: ["macos", "mac os", "mac os x", "osx", "darwin"],
  },
  {
    name: "QTS",
    image: publicAsset("images/logo/os-qnap.svg"),
    keywords: ["qts", "quts hero", "qes", "qutscloud"],
  },
  {
    name: "Astra Linux",
    image: publicAsset("images/logo/os-astar.png"),
    keywords: ["astra", "astra linux"],
  },
  {
    name: "Orange Pi",
    image: publicAsset("images/logo/os-orange-pi.svg"),
    keywords: ["orange pi", "orangepi"],
  },
  {
    name: "Huawei",
    image: publicAsset("images/logo/os-huawei.svg"),
    keywords: ["huawei", "euleros", "euler os"],
  },
  {
    name: "Aliyun",
    image: publicAsset("images/logo/alibabacloud-color.svg"),
    keywords: ["aliyun", "alibaba"],
  },
  {
    name: "OpenCloudOS",
    image: publicAsset("images/logo/os-OpenCloudOS.png"),
    keywords: ["opencloud"],
  },
  {
    name: "Unraid",
    image: publicAsset("images/logo/os-unraid.svg"),
    keywords: ["unraid"],
  },
];

const DEFAULT_OS_CONFIG: OsConfig = {
  name: "Linux",
  image: publicAsset("images/logo/linux.svg"),
  keywords: ["unknown"],
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const OS_MATCHERS = OS_CONFIGS.map((config) => ({
  config,
  matcher: new RegExp(`\\b(?:${config.keywords.map(escapeRegExp).join("|")})\\b`),
}));

function findOsConfig(osString?: string | null): OsConfig {
  if (!osString) {
    return DEFAULT_OS_CONFIG;
  }

  const normalizedInput = osString.toLowerCase().trim();
  for (const { config, matcher } of OS_MATCHERS) {
    if (matcher.test(normalizedInput)) {
      return config;
    }
  }

  return DEFAULT_OS_CONFIG;
}

export function resolveOsInfo(value?: string | null) {
  const config = findOsConfig(value);
  if (config !== DEFAULT_OS_CONFIG) {
    return config;
  }

  const name = value?.trim().split(OS_NAME_SPLIT_REGEX)[0] || DEFAULT_OS_CONFIG.name;
  return {
    ...DEFAULT_OS_CONFIG,
    name,
  };
}

export const OsLogo = memo(function OsLogo({
  value,
  size = 18,
}: {
  value?: string | null;
  size?: number;
}) {
  const os = resolveOsInfo(value);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const src = failedImage === os.image ? DEFAULT_OS_CONFIG.image : os.image;

  return (
    <img
      className="os-logo"
      src={src}
      alt={os.name}
      title={os.name}
      width={size}
      height={size}
      loading="lazy"
      draggable={false}
      onError={() => {
        if (src !== DEFAULT_OS_CONFIG.image) setFailedImage(os.image);
      }}
      style={{ "--os-logo-size": `${size}px` } as React.CSSProperties}
    />
  );
});
