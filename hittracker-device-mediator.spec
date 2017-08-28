%global package_user          hittracker-device-mediator
%global package_group         %{package_user}
%global package_home %{_localstatedir}/lib/%{name}
%global debug_package %{nil}

Name:           hittracker-device-mediator
Version:        0.1.0
Release:        1%{?dist}
Summary:        None

Group:          Applications/Internet
License:        AGPL3
URL:            https://github.com/lazerball/hittracker-device-mediator
Source0:        https://github.com/lazerball/%{name}/archive/%{version}/%{name}-%{version}.tar.gz
Source1:        preserve-gatt-structure.patch

BuildRequires:  nodejs >= 8
BuildRequires:  systemd
BuildRequires:  python2
BuildRequires:  systemd-devel
BuildRequires:  libusb-devel
BuildRequires:  bluez-libs-devel
BuildRequires:  yarn

Requires:       nodejs >= 8
Requires:       bluez
Requires:       bluez-libs
Requires(pre):    shadow-utils
Requires(post):   systemd
Requires(preun):  systemd
Requires(postun): systemd

%description

%prep
%autosetup

%build
export PATH="$PATH:$HOME/.yarn"
yarn config set prefix ~/.yarn
yarn global add node-gyp
yarn install

%install

mkdir -p %{buildroot}%{_bindir}
ln -sf bin/hittracker-device-mediator %{buildroot}%{_bindir}

cp -a sysconfig/* %{buildroot}

mkdir -p %{buildroot}%{_datadir}/%{name}

cp -a * %{buildroot}%{_datadir}/%{name}

mkdir -p %{buildroot}/run/%{name}
mkdir -p %{buildroot}/%{_localstatedir}/lib/%{name}
mkdir -p %{buildroot}/%{_localstatedir}/log/%{name}
%pre
getent group %{package_group} > /dev/null || groupadd -r %{package_group}
getent passwd %{package_user} > /dev/null || \
    useradd -r -d %{package_home} -g %{package_group} -G dialout \
    -s /sbin/nologin %{package_user}
exit 0

%post
%systemd_post hittracker-device-mediator.service

%preun
%systemd_preun hittracker-device-mediator.service

%postun
%systemd_postun_with_restart hittracker-device-mediator.service

%files
%doc LICENSE README.md
%attr(0750, %{package_user}, %{package_user}) %dir /run/%{name}
%attr(0700, %{package_user}, %{package_group}) %dir %{_localstatedir}/log/%{name}
%attr(0700, %{package_user}, %{package_group}) %dir %{_localstatedir}/lib/%{name}
%{_unitdir}/*
%{_tmpfilesdir}/%{name}.conf
%{_datadir}/%{name}
%{_bindir}/hittracker-device-mediator

%changelog
